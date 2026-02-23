import { AgentExecutor } from './executor';
import { PromptAssembler } from './prompt-assembler';
import { WaveExecutor } from './wave-executor';
import { createAdapter } from './adapters';
import { ToolRouter } from './tools/tool-router';
import { registerAgenticFSTools } from './tools/agentic-fs-tool';
import { getRegistry, type CapabilityRegistry } from './registry';
import type { Task, TaskStatus, TaskPriority, ExecutionMode, TaskArtifact, ArtifactCategory } from '@/types/task';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS, paths } from './fs-paths';
import { v4 as uuid } from 'uuid';
import { initializeConnectors } from './connectors/startup';
import { log } from './logger';

/** Agents that are expected to produce implementation artifacts */
const CODING_AGENTS = ['backend-developer', 'frontend-developer'];

/** All task status directories in the Agentic FS */
const ALL_TASK_STATUSES: TaskStatus[] = [
  'pending', 'backlog', 'todo', 'in-progress', 'review', 'done', 'blocked',
];

/** Maps agent roles to artifact categories */
const AGENT_CATEGORY_MAP: Record<string, ArtifactCategory> = {
  'technical-writer': 'requirements',
  'backend-developer': 'implementation',
  'frontend-developer': 'implementation',
  'qa-analyst': 'verification',
  'code-reviewer': 'verification',
};

export class Orchestrator {
  private registry!: CapabilityRegistry;
  private executor!: AgentExecutor;
  private toolRouter!: ToolRouter;
  private assembler!: PromptAssembler;
  private tasks: Map<string, Task> = new Map();
  private initialized = false;
  /** Tracks which parent tasks are in plan-only mode (delegate_to_agent is blocked) */
  private planOnlyTasks: Set<string> = new Set();
  /** Tracks the currently executing parent task ID so subtasks get linked */
  private currentParentTaskId: string | null = null;
  /** Default max iterations for delegated sub-agents (keeps token usage bounded).
   *  With agentic_fs_ask and batch_read, agents need fewer iterations for context
   *  gathering, so 8 gives headroom for: ask(1) → implement(1) → write(1-2) → verify(1). */
  private static SUB_AGENT_MAX_ITERATIONS = 8;

  isReady(): boolean {
    return this.initialized && this.registry?.agents?.size > 0;
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.registry?.agents?.size > 0) return;

    this.registry = await getRegistry();
    this.assembler = new PromptAssembler(this.registry);
    const adapter = createAdapter();
    this.toolRouter = new ToolRouter();

    // Register Agentic FS tools
    registerAgenticFSTools(this.toolRouter);

    // NOTE: artifact tracking is done per-task via createTaskToolRouter(), not globally

    // Register orchestration tools
    this.registerOrchestrationTools(this.assembler, adapter);

    this.executor = new AgentExecutor(this.assembler, adapter, this.toolRouter);

    // Hydrate in-memory task cache from Agentic FS
    await this.loadTasksFromFS();

    this.initialized = true;

    eventBus.emit(createEvent(
      'system:info',
      `Orchestrator initialized with ${this.registry.agents.size} agents, ${this.registry.skills.size} skills (adapter: ${adapter.name})`,
    ));

    // Fire up connectors (non-blocking, fire-and-forget)
    initializeConnectors();
  }

  private registerOrchestrationTools(assembler: PromptAssembler, adapter: ReturnType<typeof createAdapter>): void {
    // delegate_to_agent: runs a sub-agent in-process
    // In plan mode, this is blocked — returns a message telling the orchestrator to stop
    this.toolRouter.register('delegate_to_agent', async (input) => {
      const agentId = input.agent_id as string;
      const agent = this.registry.getAgent(agentId);
      if (!agent) return { error: `Agent not found: ${agentId}` };

      // Check if the calling context is plan-only (delegation blocked)
      if (this.planOnlyTasks.size > 0) {
        return {
          blocked: true,
          message: `Delegation is not allowed in plan mode. The subtask "${input.task_title}" has been noted for agent "${agent.name}". Use create_subtask instead to record the planned work, then stop and report your plan. The user will approve execution later.`,
        };
      }

      const subtask = this.createTask({
        title: input.task_title as string,
        description: input.task_description as string,
        priority: (input.priority as TaskPriority) || 'medium',
        assignedAgent: agentId,
      });

      eventBus.emit(createEvent(
        'orchestrator:delegated',
        `Delegated "${subtask.title}" to ${agent.name}`,
        { agentId, taskId: subtask.id },
        'orchestrator',
        subtask.id,
      ));

      // Execute the subtask with a fresh executor and per-task tool router
      const taskToolRouter = this.createTaskToolRouter(subtask.id);
      const subExecutor = new AgentExecutor(assembler, adapter, taskToolRouter);
      try {
        this.updateTaskStatus(subtask.id, 'in-progress');
        const result = await subExecutor.execute(agentId, subtask, undefined, Orchestrator.SUB_AGENT_MAX_ITERATIONS);
        this.updateTaskStatus(subtask.id, 'done');
        return { taskId: subtask.id, agentId, result: result.response.slice(0, 500), artifacts: subtask.artifacts?.length || 0 };
      } catch (error) {
        this.updateTaskStatus(subtask.id, 'blocked');
        subtask.errorMessage = String(error);
        return { taskId: subtask.id, agentId, error: String(error) };
      }
    });

    // create_subtask: creates a new task linked to the current parent
    this.toolRouter.register('create_subtask', async (input) => {
      const task = this.createTask({
        title: input.title as string,
        description: input.description as string,
        priority: (input.priority as TaskPriority) || 'medium',
        assignedAgent: input.assigned_agent as string | undefined,
        parentTaskId: this.currentParentTaskId || undefined,
        executionOrder: input.execution_order as number | undefined,
        dependsOn: input.depends_on as string[] | undefined,
      });
      // Link subtask to parent
      if (this.currentParentTaskId) {
        const parent = this.tasks.get(this.currentParentTaskId);
        if (parent) parent.subtaskIds.push(task.id);
      }
      // Persist subtask to Agentic FS
      this.persistTask(task).catch(() => {});
      return { taskId: task.id, title: task.title, status: task.status, assignedAgent: task.assignedAgent };
    });

    // update_task_status
    this.toolRouter.register('update_task_status', async (input) => {
      const taskId = input.task_id as string;
      const status = input.status as TaskStatus;
      this.updateTaskStatus(taskId, status);
      return { taskId, status };
    });
  }

  /**
   * Creates a per-task tool router proxy that intercepts agentic_fs_write
   * calls to:
   * 1. Rewrite the artifact path to be task-scoped (artifacts/{taskId}/{category}/{filename})
   * 2. Attach artifacts to the correct task for tracking
   */
  private createTaskToolRouter(taskId: string): ToolRouter {
    const baseRouter = this.toolRouter;
    const self = this;

    const proxy = Object.create(baseRouter) as ToolRouter;
    proxy.execute = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
      // For agentic_fs_write, rewrite namespace/path to task-scoped location
      if (toolName === 'agentic_fs_write') {
        const category = (input.category as ArtifactCategory) || 'other';
        const rewrittenInput = {
          ...input,
          namespace: NS.ARTIFACTS,
          path: paths.artifacts.taskCategoryDir(taskId, category),
        };

        const result = await baseRouter.execute(toolName, rewrittenInput);

        try {
          const parsed = JSON.parse(result);
          if (parsed.file_id) {
            self.addArtifact(taskId, {
              fileId: parsed.file_id,
              filename: (input.filename as string) || 'unknown',
              namespace: NS.ARTIFACTS,
              path: paths.artifacts.taskCategoryDir(taskId, category),
              createdAt: new Date().toISOString(),
              category,
            });
            log.info('orchestrator', `Artifact tracked: ${input.filename}`, { taskId, fileId: parsed.file_id, category });
          } else if (parsed.error) {
            log.error('orchestrator', `agentic_fs_write returned error for "${input.filename}"`, { taskId, error: parsed.error, category });
          } else {
            log.warn('orchestrator', `agentic_fs_write response missing file_id for "${input.filename}"`, { taskId, result: result.slice(0, 200) });
          }
        } catch (parseErr) {
          log.error('orchestrator', `Failed to parse agentic_fs_write response for "${input.filename}"`, { taskId, parseError: String(parseErr), result: result.slice(0, 200) });
        }

        return result;
      }

      return baseRouter.execute(toolName, input);
    };
    return proxy;
  }

  /** Attach an artifact to a task (and its parent if it has one).
   *  Deduplicates by filename — if a file with the same name exists,
   *  it replaces the old entry (agent rewrote the file). */
  private addArtifact(taskId: string, artifact: TaskArtifact): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (!task.artifacts) task.artifacts = [];

    // Deduplicate: replace existing artifact with same filename
    const existingIdx = task.artifacts.findIndex(a => a.filename === artifact.filename);
    if (existingIdx >= 0) {
      task.artifacts[existingIdx] = artifact;
    } else {
      task.artifacts.push(artifact);
    }

    eventBus.emit(createEvent(
      'task:artifact',
      `Artifact "${artifact.filename}" (${artifact.category}) attached to "${task.title}"`,
      { taskId, fileId: artifact.fileId, filename: artifact.filename, category: artifact.category },
      task.assignedAgent,
      taskId,
    ));

    // Also attach to parent task for visibility (with deduplication)
    if (task.parentTaskId) {
      const parent = this.tasks.get(task.parentTaskId);
      if (parent) {
        if (!parent.artifacts) parent.artifacts = [];
        const parentIdx = parent.artifacts.findIndex(a => a.filename === artifact.filename);
        if (parentIdx >= 0) {
          parent.artifacts[parentIdx] = artifact;
        } else {
          parent.artifacts.push(artifact);
        }
      }
    }
  }

  /**
   * Submit a task to the orchestrator.
   * @param mode - 'plan' (default): decompose only, don't delegate. 'execute': full autonomous execution.
   */
  async submitTask(title: string, description: string, priority?: string, mode?: ExecutionMode): Promise<Task> {
    await this.initialize();

    const executionMode: ExecutionMode = mode || 'plan';

    const task = this.createTask({
      title,
      description,
      priority: (priority as TaskPriority) || 'medium',
      executionMode,
    });

    eventBus.emit(createEvent(
      'task:created',
      `Task created: ${title} (mode: ${executionMode})`,
      { taskId: task.id, title, executionMode },
    ));

    // Try to persist to Agentic FS (non-blocking, best-effort)
    this.persistTask(task).catch(() => {});

    // Execute orchestrator asynchronously
    this.executeAsync(task);

    return task;
  }

  /**
   * Execute approved subtasks — called after user reviews the plan and approves.
   * Takes specific task IDs to execute, not the whole plan.
   */
  async executeApproved(taskIds: string[]): Promise<void> {
    await this.initialize();

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (!task) continue;
      if (!task.assignedAgent) {
        // No agent assigned — skip
        eventBus.emit(createEvent(
          'system:info',
          `Skipping "${task.title}" — no agent assigned`,
          { taskId },
        ));
        continue;
      }

      const agent = this.registry.getAgent(task.assignedAgent);
      if (!agent) continue;

      eventBus.emit(createEvent(
        'orchestrator:delegated',
        `Executing approved task "${task.title}" → ${agent.name}`,
        { agentId: task.assignedAgent, taskId },
        'orchestrator',
        taskId,
      ));

      // Execute in background (don't block the loop)
      this.executeDelegatedTask(task).catch(() => {});
    }
  }

  private async executeDelegatedTask(task: Task): Promise<void> {
    const adapter = createAdapter();
    // Each task gets its own tool router proxy so artifacts are tracked correctly
    const taskToolRouter = this.createTaskToolRouter(task.id);
    const subExecutor = new AgentExecutor(this.assembler, adapter, taskToolRouter);

    try {
      this.updateTaskStatus(task.id, 'in-progress');
      const result = await subExecutor.execute(
        task.assignedAgent!, task, undefined, Orchestrator.SUB_AGENT_MAX_ITERATIONS
      );
      // Store result and usage on the task for auditability
      task.result = result.response.slice(0, 500);
      task.usage = {
        totalInputTokens: result.usage.totalInputTokens,
        totalOutputTokens: result.usage.totalOutputTokens,
        iterations: result.usage.iterationDetails?.length || 1,
        iterationDetails: result.usage.iterationDetails,
      };

      // Validate coding agents produced artifacts
      const artifactCount = task.artifacts?.length || 0;
      if (CODING_AGENTS.includes(task.assignedAgent!) && artifactCount === 0) {
        log.warn('orchestrator', `Coding agent "${task.assignedAgent}" completed with ZERO artifacts for "${task.title}"`, { taskId: task.id });
        this.updateTaskStatus(task.id, 'blocked');
        task.errorMessage = `Agent ${task.assignedAgent} completed execution but produced no artifacts.`;
      } else {
        log.info('orchestrator', `Task "${task.title}" completed with ${artifactCount} artifact(s)`, { taskId: task.id, agent: task.assignedAgent });
        this.updateTaskStatus(task.id, 'done');
      }

      // Persist updated state
      this.persistTaskUpdate(task).catch(() => {});
    } catch (error) {
      this.updateTaskStatus(task.id, 'blocked');
      task.errorMessage = String(error);
      eventBus.emit(createEvent(
        'agent:error',
        `Agent ${task.assignedAgent} error: ${String(error)}`,
        { error: String(error) },
        task.assignedAgent,
        task.id,
      ));
    }
  }

  private async persistTask(task: Task): Promise<void> {
    try {
      const fs = getAgenticFSClient();
      const result = await fs.uploadFile(
        JSON.stringify(task, null, 2),
        `${task.id}.json`,
        { namespace: NS.TASKS, path: paths.tasks.dir(task.status), tags: ['task', task.priority] }
      );
      task.fileId = result.file_id;
    } catch {
      // Agentic FS may not be available; continue without persistence
    }
  }

  /** Update an existing task file in Agentic FS after status change */
  private async persistTaskUpdate(task: Task): Promise<void> {
    if (!task.fileId) return;
    try {
      const fs = getAgenticFSClient();
      await fs.replaceFile(task.fileId, JSON.stringify(task, null, 2), `${task.id}.json`);
      // Move file to new status directory
      await fs.moveFile(task.fileId, paths.tasks.dir(task.status), NS.TASKS);
    } catch {
      // Agentic FS may not be available
    }
  }

  /** Hydrate in-memory task cache from Agentic FS on startup */
  private async loadTasksFromFS(): Promise<void> {
    try {
      const fs = getAgenticFSClient();

      // List all status directories in parallel
      const dirResults = await Promise.allSettled(
        ALL_TASK_STATUSES.map(status =>
          fs.listDirectory(paths.tasks.dir(status), NS.TASKS)
            .then(result => ({ status, entries: result.entries }))
        )
      );

      // Collect file IDs from successful listings
      const fileIds: string[] = [];
      for (const result of dirResults) {
        if (result.status === 'fulfilled') {
          for (const entry of result.value.entries) {
            if (entry.type === 'file' && entry.file_id) {
              fileIds.push(entry.file_id);
            }
          }
        }
      }

      if (fileIds.length === 0) return;

      // Batch retrieve in chunks of 50
      const BATCH_SIZE = 50;
      let loaded = 0;
      let errors = 0;

      for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
        const chunk = fileIds.slice(i, i + BATCH_SIZE);
        try {
          const batch = await fs.batchRetrieve(chunk, { includeContent: true });
          for (const file of batch.files) {
            try {
              const taskData: Task = typeof file.content === 'string'
                ? JSON.parse(file.content)
                : file.content as unknown as Task;

              if (!taskData.id || !taskData.title || !taskData.status) {
                errors++;
                continue;
              }

              // Ensure fileId is set from the FS response
              taskData.fileId = file.file_id;
              // Defaults for fields that may be missing in old data
              if (!taskData.subtaskIds) taskData.subtaskIds = [];
              if (!taskData.tags) taskData.tags = [];

              this.tasks.set(taskData.id, taskData);
              loaded++;
            } catch {
              errors++;
            }
          }
        } catch {
          // Skip failed batch, continue with next
        }
      }

      eventBus.emit(createEvent(
        'system:info',
        `Loaded ${loaded} task(s) from Agentic FS (${errors} error(s), ${fileIds.length} file(s) scanned)`,
      ));
    } catch {
      eventBus.emit(createEvent(
        'system:info',
        'Agentic FS unavailable — starting with empty task store',
      ));
    }
  }

  private async executeAsync(task: Task): Promise<void> {
    // In plan mode, block delegation during orchestrator execution
    if (task.executionMode === 'plan') {
      this.planOnlyTasks.add(task.id);
    }

    // Track parent so create_subtask links correctly
    this.currentParentTaskId = task.id;

    try {
      // In plan mode, task stays in backlog (no status change visible to user)
      // In execute mode, move to in-progress
      if (task.executionMode !== 'plan') {
        this.updateTaskStatus(task.id, 'in-progress');
      }

      // Add execution mode context to the orchestrator prompt
      const modeContext = task.executionMode === 'plan'
        ? `\n\n## EXECUTION MODE: PLAN ONLY\nYou are in PLAN mode. Your job is to:\n1. Analyze the task and search for relevant context (1-2 searches max)\n2. Decompose into subtasks using create_subtask (assign each to the best agent using the assigned_agent field)\n3. For each subtask, provide a clear title, detailed description of what needs to be done, the assigned agent, and priority\n4. Write a brief plan summary as your final text response\n\nDO NOT use delegate_to_agent — delegation is blocked in plan mode. The user will review your plan and approve execution.\n\nIMPORTANT CONSTRAINTS:\n- Create as many subtasks as needed to fully cover the work (typically 3-8)\n- Include enough detail in each subtask description for the assigned agent to understand the full scope\n- Do NOT write files to Agentic FS during planning — save that for execution\n- End with a text summary of the plan`
        : '';

      // In plan mode, use a moderate iteration cap — enough to create subtasks with detail
      const planOverride = task.executionMode === 'plan' ? 20 : undefined;
      await this.executor.execute('orchestrator', task, modeContext, planOverride);

      if (task.executionMode === 'plan') {
        // Task stays in backlog with subtasks and plan visible
        // Emit plan_ready event so UI knows planning is complete
        eventBus.emit(createEvent(
          'orchestrator:plan_ready',
          `Plan ready for "${task.title}" — ${this.getSubtasks(task.id).length} subtasks created. Move to To Do to begin.`,
          { taskId: task.id, subtaskCount: this.getSubtasks(task.id).length },
          'orchestrator',
          task.id,
        ));
        // Persist updated parent with subtaskIds
        this.persistTaskUpdate(task).catch(() => {});
      } else {
        this.updateTaskStatus(task.id, 'done');
      }
    } catch (error) {
      eventBus.emit(createEvent(
        'agent:error',
        `Orchestrator error: ${String(error)}`,
        { error: String(error) },
        'orchestrator',
        task.id,
      ));
      this.updateTaskStatus(task.id, 'blocked');
    } finally {
      this.planOnlyTasks.delete(task.id);
      this.currentParentTaskId = null;
    }
  }

  private createTask(params: {
    title: string;
    description: string;
    priority?: TaskPriority;
    assignedAgent?: string;
    parentTaskId?: string;
    executionMode?: ExecutionMode;
    executionOrder?: number;
    dependsOn?: string[];
  }): Task {
    const task: Task = {
      id: uuid(),
      title: params.title,
      description: params.description,
      status: params.parentTaskId ? 'pending' : 'backlog',
      priority: params.priority || 'medium',
      executionMode: params.executionMode || 'plan',
      assignedAgent: params.assignedAgent,
      parentTaskId: params.parentTaskId,
      subtaskIds: [],
      executionOrder: params.executionOrder,
      dependsOn: params.dependsOn,
      tags: [],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  private updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      eventBus.emit(createEvent(
        'task:updated',
        `Task "${task.title}" → ${status}`,
        { taskId, status, title: task.title },
        task.assignedAgent,
        taskId,
      ));
    }
  }

  /**
   * Manually update a task's status from the UI.
   * Transition validation must be done by the caller (API route).
   * Fires transition actions asynchronously (non-blocking).
   */
  async manualUpdateStatus(taskId: string, newStatus: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const previousStatus = task.status;
    this.updateTaskStatus(taskId, newStatus);

    // Persist to FS (best-effort)
    this.persistTaskUpdate(task).catch(() => {});

    // Fire transition action asynchronously (non-blocking)
    this.executeTransitionAction(previousStatus, newStatus, task).catch((err) => {
      eventBus.emit(createEvent(
        'system:error',
        `Transition action error (${previousStatus} → ${newStatus}): ${String(err)}`,
        { error: String(err), taskId },
      ));
    });
  }

  /**
   * Execute actions triggered by status transitions.
   */
  private async executeTransitionAction(from: TaskStatus, to: TaskStatus, task: Task): Promise<void> {
    const key = `${from}->${to}`;

    switch (key) {
      case 'backlog->todo':
        await this.runDocumentationGeneration(task);
        break;
      case 'todo->in-progress':
        await this.runImplementation(task);
        break;
      case 'review->done':
        this.cascadeSubtasksToDone(task);
        break;
    }
  }

  /**
   * Triggered on backlog→todo: runs wave 1 subtasks (typically technical-writer)
   * to create acceptance criteria and requirements documentation.
   */
  private async runDocumentationGeneration(task: Task): Promise<void> {
    const subtasks = this.getSubtasks(task.id);
    const writerSubtasks = subtasks.filter(s =>
      s.assignedAgent === 'technical-writer' &&
      s.status === 'pending'
    );

    if (writerSubtasks.length === 0) return;

    eventBus.emit(createEvent(
      'task:transition_action',
      `Generating documentation for "${task.title}" — ${writerSubtasks.length} technical-writer subtask(s) (backlog → todo)`,
      { taskId: task.id, action: 'documentation_generation', subtaskCount: writerSubtasks.length },
      'technical-writer',
      task.id,
    ));

    const waveExecutor = new WaveExecutor(this.assembler, createAdapter(), this.toolRouter);
    waveExecutor.executeWaves(
      task, writerSubtasks,
      (taskId) => this.createTaskToolRouter(taskId),
      (subtask) => this.persistTaskUpdate(subtask).catch(() => {}),
    ).catch((err) => {
      eventBus.emit(createEvent(
        'system:error',
        `Documentation wave error: ${String(err)}`,
        { error: String(err), taskId: task.id },
      ));
    });
  }

  /**
   * Triggered on todo→in-progress: runs all pending subtasks in sequential waves.
   * Uses WaveExecutor for ordered execution based on executionOrder.
   */
  private async runImplementation(task: Task): Promise<void> {
    const subtasks = this.getSubtasks(task.id);
    if (subtasks.length === 0) return;

    // Only delegate subtasks still in pending — skip any already in-progress/done/blocked
    const pendingSubtasks = subtasks.filter(s =>
      s.assignedAgent &&
      this.registry.getAgent(s.assignedAgent) &&
      s.status === 'pending'
    );

    if (pendingSubtasks.length === 0) return;

    eventBus.emit(createEvent(
      'task:transition_action',
      `Starting implementation for "${task.title}" — ${pendingSubtasks.length} of ${subtasks.length} subtasks (todo → in-progress)`,
      { taskId: task.id, action: 'implementation', subtaskCount: pendingSubtasks.length },
      'orchestrator',
      task.id,
    ));

    // Execute subtasks in sequential waves (non-blocking)
    const waveExecutor = new WaveExecutor(this.assembler, createAdapter(), this.toolRouter);
    waveExecutor.executeWaves(
      task, pendingSubtasks,
      (taskId) => this.createTaskToolRouter(taskId),
      (subtask) => this.persistTaskUpdate(subtask).catch(() => {}),
    ).catch((err) => {
      eventBus.emit(createEvent(
        'system:error',
        `Implementation wave error: ${String(err)}`,
        { error: String(err), taskId: task.id },
      ));
    });
  }

  /**
   * Triggered on review→done: cascades all non-done subtasks to done.
   */
  private cascadeSubtasksToDone(parentTask: Task): void {
    const subtasks = this.getSubtasks(parentTask.id);

    for (const subtask of subtasks) {
      if (subtask.status !== 'done') {
        const previousStatus = subtask.status;
        this.updateTaskStatus(subtask.id, 'done');
        this.persistTaskUpdate(subtask).catch(() => {});

        eventBus.emit(createEvent(
          'task:subtask_cascade',
          `Subtask "${subtask.title}" cascaded to done from ${previousStatus} (parent completed)`,
          { parentTaskId: parentTask.id, subtaskId: subtask.id, from: previousStatus },
          subtask.assignedAgent,
          subtask.id,
        ));
      }
    }
  }

  /** Get subtasks of a parent task */
  getSubtasks(parentTaskId: string): Task[] {
    return this.getTasks().filter(t => t.parentTaskId === parentTaskId);
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getTasks().filter(t => t.status === status);
  }
}

// Use globalThis to ensure a single instance survives Turbopack module isolation in dev mode
const orchestratorKey = '__agilityflow_orchestrator__' as const;
export async function getOrchestrator(): Promise<Orchestrator> {
  let orchestrator = (globalThis as Record<string, unknown>)[orchestratorKey] as Orchestrator | undefined;
  if (!orchestrator || !orchestrator.isReady()) {
    orchestrator = new Orchestrator();
    await orchestrator.initialize();
    (globalThis as Record<string, unknown>)[orchestratorKey] = orchestrator;
  }
  return orchestrator;
}
