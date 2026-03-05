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
import { implementTask as runImplementation } from './implementer';
import { runTests as runTestExecution } from './test-runner';
import { getSettingsService } from './settings-service';
import { log, startTimer } from './logger';
import { getAllStatusIds, getTransitionAction, getSubtaskInitialStatus, getParentInitialStatus } from './workflow-loader';
import { withTraceAsync, getTraceId, generateTraceId } from './trace';

export class Orchestrator {
  private registry!: CapabilityRegistry;
  private executor!: AgentExecutor;
  private toolRouter!: ToolRouter;
  private assembler!: PromptAssembler;
  private tasks: Map<string, Task> = new Map();
  private initialized = false;
  private planOnlyTasks: Set<string> = new Set();
  private currentParentTaskId: string | null = null;

  isReady(): boolean {
    return this.initialized && this.registry?.agents?.size > 0;
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.registry?.agents?.size > 0) return;

    const elapsed = startTimer();
    this.registry = await getRegistry();
    this.assembler = new PromptAssembler(this.registry);
    const adapter = createAdapter();
    this.toolRouter = new ToolRouter();

    registerAgenticFSTools(this.toolRouter);
    this.registerOrchestrationTools(this.assembler, adapter);
    this.executor = new AgentExecutor(this.assembler, adapter, this.toolRouter);

    await this.loadTasksFromFS();

    this.initialized = true;

    log.info('orchestrator', `Initialized (${this.registry.agents.size} agents, ${this.registry.skills.size} skills, adapter: ${adapter.name})`, { elapsedMs: elapsed() });

    eventBus.emit(createEvent(
      'system:info',
      `Orchestrator initialized with ${this.registry.agents.size} agents, ${this.registry.skills.size} skills (adapter: ${adapter.name})`,
    ));

    initializeConnectors();
  }

  private registerOrchestrationTools(assembler: PromptAssembler, adapter: ReturnType<typeof createAdapter>): void {
    this.toolRouter.register('delegate_to_agent', async (input) => {
      const agentId = input.agent_id as string;
      const agent = this.registry.getAgent(agentId);
      if (!agent) return { error: `Agent not found: ${agentId}` };

      if (this.planOnlyTasks.size > 0) {
        log.debug('orchestrator', `Delegation blocked (plan mode) for "${input.task_title}" → ${agentId}`);
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

      log.info('orchestrator', `Delegating to ${agentId}: "${subtask.title}"`, { taskId: subtask.id, agentId });

      eventBus.emit(createEvent(
        'orchestrator:delegated',
        `Delegated "${subtask.title}" to ${agent.name}`,
        { agentId, taskId: subtask.id },
        'orchestrator',
        subtask.id,
      ));

      const taskToolRouter = this.createTaskToolRouter(subtask.id);
      const subExecutor = new AgentExecutor(assembler, adapter, taskToolRouter);
      try {
        this.updateTaskStatus(subtask.id, 'in-progress');
        const iterBudget = this.getAgentIterationBudget(agentId);
        const result = await subExecutor.execute(agentId, subtask, undefined, iterBudget);
        this.updateTaskStatus(subtask.id, 'done');
        return { taskId: subtask.id, agentId, result: result.response.slice(0, 500), artifacts: subtask.artifacts?.length || 0 };
      } catch (error) {
        this.updateTaskStatus(subtask.id, 'blocked');
        subtask.errorMessage = String(error);
        log.error('orchestrator', `Delegation failed for "${subtask.title}"`, { taskId: subtask.id, agentId, error: String(error) });
        return { taskId: subtask.id, agentId, error: String(error) };
      }
    });

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
      if (this.currentParentTaskId) {
        const parent = this.tasks.get(this.currentParentTaskId);
        if (parent) parent.subtaskIds.push(task.id);
      }

      log.info('orchestrator', `Subtask created: "${task.title}"`, {
        taskId: task.id,
        parentTaskId: this.currentParentTaskId,
        assignedAgent: task.assignedAgent,
        executionOrder: task.executionOrder,
      });

      this.persistTask(task).catch(() => {});
      return { taskId: task.id, title: task.title, status: task.status, assignedAgent: task.assignedAgent };
    });

    this.toolRouter.register('update_task_status', async (input) => {
      const taskId = input.task_id as string;
      const status = input.status as TaskStatus;
      this.updateTaskStatus(taskId, status);
      return { taskId, status };
    });
  }

  /**
   * Resolve iteration budget for an agent from its definition.
   * Checks iterationBudget first, then maxIterations, then falls back to default.
   */
  private getAgentIterationBudget(agentId: string): number {
    const SAFETY_NET = 100;
    const agentDef = this.registry.getAgent(agentId);
    if (!agentDef) {
      log.warn('orchestrator', `No agent definition for "${agentId}" — using safety-net iteration budget`, { agentId, budget: SAFETY_NET });
      return SAFETY_NET;
    }
    const budget = agentDef.iterationBudget ?? agentDef.maxIterations;
    if (budget === undefined) {
      log.warn('orchestrator', `Agent "${agentId}" has no iterationBudget or maxIterations — using safety-net`, { agentId, budget: SAFETY_NET });
      return SAFETY_NET;
    }
    log.debug('orchestrator', `Iteration budget for "${agentId}": ${budget}`, { agentId, iterationBudget: agentDef.iterationBudget, maxIterations: agentDef.maxIterations, resolved: budget });
    return budget;
  }

  private createTaskToolRouter(taskId: string): ToolRouter {
    const baseRouter = this.toolRouter;
    const self = this;

    const proxy = Object.create(baseRouter) as ToolRouter;
    proxy.execute = async (toolName: string, input: Record<string, unknown>): Promise<string> => {
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

  private addArtifact(taskId: string, artifact: TaskArtifact): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (!task.artifacts) task.artifacts = [];

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

  async submitTask(title: string, description: string, priority?: string, mode?: ExecutionMode): Promise<Task> {
    await this.initialize();

    const executionMode: ExecutionMode = mode || 'plan';

    const task = this.createTask({
      title,
      description,
      priority: (priority as TaskPriority) || 'medium',
      executionMode,
    });

    log.info('orchestrator', `Task submitted: "${title}"`, { taskId: task.id, priority: task.priority, mode: executionMode });

    eventBus.emit(createEvent(
      'task:created',
      `Task created: ${title} (mode: ${executionMode})`,
      { taskId: task.id, title, executionMode },
    ));

    this.persistTask(task).catch(() => {});

    const traceId = getTraceId() || generateTraceId();
    this.executeAsync(task, traceId);

    return task;
  }

  async executeApproved(taskIds: string[]): Promise<void> {
    await this.initialize();

    const traceId = getTraceId() || generateTraceId();

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (!task) continue;
      if (!task.assignedAgent) {
        eventBus.emit(createEvent(
          'system:info',
          `Skipping "${task.title}" — no agent assigned`,
          { taskId },
        ));
        continue;
      }

      const agent = this.registry.getAgent(task.assignedAgent);
      if (!agent) continue;

      log.info('orchestrator', `Executing approved task: "${task.title}" → ${task.assignedAgent}`, { taskId });

      eventBus.emit(createEvent(
        'orchestrator:delegated',
        `Executing approved task "${task.title}" → ${agent.name}`,
        { agentId: task.assignedAgent, taskId },
        'orchestrator',
        taskId,
      ));

      this.executeDelegatedTask(task, traceId).catch(() => {});
    }
  }

  private async executeDelegatedTask(task: Task, traceId?: string): Promise<void> {
    const effectiveTraceId = traceId || getTraceId() || generateTraceId();

    return withTraceAsync({ traceId: effectiveTraceId, taskId: task.id, agentId: task.assignedAgent || undefined }, async () => {
      const elapsed = startTimer();
      const adapter = createAdapter();
      const taskToolRouter = this.createTaskToolRouter(task.id);
      const subExecutor = new AgentExecutor(this.assembler, adapter, taskToolRouter);

      log.info('orchestrator', `Delegated execution starting: "${task.title}" → ${task.assignedAgent}`, { taskId: task.id, agentId: task.assignedAgent });

      try {
        this.updateTaskStatus(task.id, 'in-progress');
        const iterBudget = this.getAgentIterationBudget(task.assignedAgent!);
        const result = await subExecutor.execute(
          task.assignedAgent!, task, undefined, iterBudget
        );
        task.result = result.response.slice(0, 500);
        task.usage = {
          totalInputTokens: result.usage.totalInputTokens,
          totalOutputTokens: result.usage.totalOutputTokens,
          iterations: result.usage.iterationDetails?.length || 1,
          iterationDetails: result.usage.iterationDetails,
        };

        const artifactCount = task.artifacts?.length || 0;
        const agentDef = this.registry.getAgent(task.assignedAgent!);
        if (agentDef?.requiresArtifacts && artifactCount === 0) {
          log.warn('orchestrator', `Agent "${task.assignedAgent}" completed with ZERO artifacts for "${task.title}"`, { taskId: task.id });
          this.updateTaskStatus(task.id, 'blocked');
          task.errorMessage = `Agent ${task.assignedAgent} completed execution but produced no artifacts.`;
        } else {
          log.info('orchestrator', `Delegated execution complete: "${task.title}" (${artifactCount} artifact(s))`, {
            taskId: task.id,
            agent: task.assignedAgent,
            artifactCount,
            inputTokens: result.usage.totalInputTokens,
            outputTokens: result.usage.totalOutputTokens,
            iterations: result.usage.iterationDetails?.length,
            elapsedMs: elapsed(),
          });
          this.updateTaskStatus(task.id, 'done');
        }

        this.persistTaskUpdate(task).catch(() => {});
      } catch (error) {
        log.error('orchestrator', `Delegated execution failed: "${task.title}"`, {
          taskId: task.id, agentId: task.assignedAgent,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
          elapsedMs: elapsed(),
        });
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
    });
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
      log.debug('orchestrator', `Task persisted to FS`, { taskId: task.id, fileId: result.file_id });
    } catch (err) {
      log.warn('orchestrator', `Failed to persist task to FS`, { taskId: task.id, error: String(err) });
    }
  }

  private async persistTaskUpdate(task: Task): Promise<void> {
    if (!task.fileId) return;
    try {
      const fs = getAgenticFSClient();
      await fs.replaceFile(task.fileId, JSON.stringify(task, null, 2), `${task.id}.json`);
      await fs.moveFile(task.fileId, paths.tasks.dir(task.status), NS.TASKS);
    } catch (err) {
      log.warn('orchestrator', `Failed to update task in FS`, { taskId: task.id, fileId: task.fileId, error: String(err) });
    }
  }

  private async loadTasksFromFS(): Promise<void> {
    try {
      const elapsed = startTimer();
      const fs = getAgenticFSClient();

      const dirResults = await Promise.allSettled(
        getAllStatusIds().map(status =>
          fs.listDirectory(paths.tasks.dir(status), NS.TASKS)
            .then(result => ({ status, entries: result.entries }))
        )
      );

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

      if (fileIds.length === 0) {
        log.debug('orchestrator', 'No tasks found in FS');
        return;
      }

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

              taskData.fileId = file.file_id;
              if (!taskData.subtaskIds) taskData.subtaskIds = [];
              if (!taskData.tags) taskData.tags = [];

              this.tasks.set(taskData.id, taskData);
              loaded++;
            } catch {
              errors++;
            }
          }
        } catch {
          // Skip failed batch
        }
      }

      log.info('orchestrator', `Task cache hydrated from FS`, { loaded, errors, filesScanned: fileIds.length, elapsedMs: elapsed() });

      eventBus.emit(createEvent(
        'system:info',
        `Loaded ${loaded} task(s) from Agentic FS (${errors} error(s), ${fileIds.length} file(s) scanned)`,
      ));
    } catch {
      log.debug('orchestrator', 'Agentic FS unavailable — starting with empty task store');
      eventBus.emit(createEvent(
        'system:info',
        'Agentic FS unavailable — starting with empty task store',
      ));
    }
  }

  private async executeAsync(task: Task, traceId: string): Promise<void> {
    return withTraceAsync({ traceId, taskId: task.id }, async () => {
      const elapsed = startTimer();

      if (task.executionMode === 'plan') {
        this.planOnlyTasks.add(task.id);
      }

      this.currentParentTaskId = task.id;

      log.info('orchestrator', `Executing task async: "${task.title}" (mode: ${task.executionMode})`, { taskId: task.id, mode: task.executionMode });

      try {
        if (task.executionMode !== 'plan') {
          this.updateTaskStatus(task.id, 'in-progress');
        }

        const modeContext = task.executionMode === 'plan'
          ? `\n\n## EXECUTION MODE: PLAN ONLY\nYou are in PLAN mode. Your job is to:\n1. Analyze the task and search for relevant context (1-2 searches max)\n2. Decompose into subtasks using create_subtask (assign each to the best agent using the assigned_agent field)\n3. For each subtask, provide a clear title, detailed description of what needs to be done, the assigned agent, and priority\n4. Write a brief plan summary as your final text response\n\nDO NOT use delegate_to_agent — delegation is blocked in plan mode. The user will review your plan and approve execution.\n\nIMPORTANT CONSTRAINTS:\n- Create as many subtasks as needed to fully cover the work (typically 3-8)\n- Include enough detail in each subtask description for the assigned agent to understand the full scope\n- Do NOT write files to Agentic FS during planning — save that for execution\n- End with a text summary of the plan`
          : '';

        const planOverride = task.executionMode === 'plan'
          ? this.getAgentIterationBudget('orchestrator')
          : undefined;
        await this.executor.execute('orchestrator', task, modeContext, planOverride);

        if (task.executionMode === 'plan') {
          const subtaskCount = this.getSubtasks(task.id).length;
          task.decompositionComplete = true;
          log.info('orchestrator', `Plan complete for "${task.title}" — ${subtaskCount} subtask(s) created`, { taskId: task.id, subtaskCount, elapsedMs: elapsed() });
          eventBus.emit(createEvent(
            'orchestrator:plan_ready',
            `Plan ready for "${task.title}" — ${subtaskCount} subtasks created. Move to To Do to begin.`,
            { taskId: task.id, subtaskCount },
            'orchestrator',
            task.id,
          ));
          this.persistTaskUpdate(task).catch(() => {});
        } else {
          log.info('orchestrator', `Task execution complete: "${task.title}"`, { taskId: task.id, elapsedMs: elapsed() });
          this.updateTaskStatus(task.id, 'done');
        }
      } catch (error) {
        log.error('orchestrator', `Task execution failed: "${task.title}"`, {
          taskId: task.id, error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
          elapsedMs: elapsed(),
        });
        eventBus.emit(createEvent(
          'agent:error',
          `Orchestrator error: ${String(error)}`,
          { error: String(error) },
          'orchestrator',
          task.id,
        ));
        task.decompositionComplete = true;
        this.updateTaskStatus(task.id, 'blocked');
      } finally {
        this.planOnlyTasks.delete(task.id);
        this.currentParentTaskId = null;
      }
    });
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
      status: params.parentTaskId
        ? getSubtaskInitialStatus()
        : getParentInitialStatus(),
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
      decompositionComplete: (!params.parentTaskId && (params.executionMode || 'plan') === 'plan')
        ? false
        : undefined,
    };
    this.tasks.set(task.id, task);
    log.debug('orchestrator', `Task created: "${task.title}" [${task.status}]`, {
      taskId: task.id, parentTaskId: params.parentTaskId, assignedAgent: params.assignedAgent,
    });
    return task;
  }

  private updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const previousStatus = task.status;
      task.status = status;
      task.updatedAt = new Date().toISOString();
      log.info('orchestrator', `Status: "${task.title}" ${previousStatus} → ${status}`, { taskId, from: previousStatus, to: status });
      eventBus.emit(createEvent(
        'task:updated',
        `Task "${task.title}" → ${status}`,
        { taskId, status, title: task.title },
        task.assignedAgent,
        taskId,
      ));
    }
  }

  async manualUpdateStatus(taskId: string, newStatus: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const previousStatus = task.status;
    this.updateTaskStatus(taskId, newStatus);
    this.persistTaskUpdate(task).catch(() => {});

    this.executeTransitionAction(previousStatus, newStatus, task).catch((err) => {
      eventBus.emit(createEvent(
        'system:error',
        `Transition action error (${previousStatus} → ${newStatus}): ${String(err)}`,
        { error: String(err), taskId },
      ));
    });
  }

  private async executeTransitionAction(from: TaskStatus, to: TaskStatus, task: Task): Promise<void> {
    const actionDef = getTransitionAction(from, to);
    if (!actionDef) return;

    log.info('orchestrator', `Transition action: ${from} → ${to} (${actionDef.action})`, { taskId: task.id, action: actionDef.action });

    switch (actionDef.action) {
      case 'run_wave':
        await this.runFilteredWave(task, actionDef.filter);
        break;
      case 'cascade_done':
        this.cascadeSubtasksToDone(task);
        break;
    }
  }

  private async runFilteredWave(
    task: Task,
    filter?: { status?: string; agents?: string[] },
  ): Promise<void> {
    const subtasks = this.getSubtasks(task.id);
    const targetStatus = filter?.status || 'pending';
    const agentFilter = filter?.agents;

    const matching = subtasks.filter(s => {
      if (s.status !== targetStatus) return false;
      if (agentFilter && agentFilter.length > 0) {
        return agentFilter.includes(s.assignedAgent || '');
      }
      return true;
    });

    if (matching.length === 0) return;

    const filterDesc = agentFilter ? agentFilter.join(', ') : 'all pending';
    log.info('orchestrator', `Running wave for "${task.title}" — ${matching.length} subtask(s) [${filterDesc}]`, { taskId: task.id, subtaskCount: matching.length });

    eventBus.emit(createEvent(
      'task:transition_action',
      `Running wave for "${task.title}" — ${matching.length} subtask(s) matching [${filterDesc}]`,
      { taskId: task.id, action: 'run_wave', subtaskCount: matching.length },
      'orchestrator',
      task.id,
    ));

    const waveExecutor = new WaveExecutor(this.assembler, createAdapter(), this.toolRouter);
    waveExecutor.executeWaves(
      task, matching,
      (taskId) => this.createTaskToolRouter(taskId),
      (subtask) => this.persistTaskUpdate(subtask).catch(() => {}),
    ).catch((err) => {
      eventBus.emit(createEvent(
        'system:error',
        `Wave execution error: ${String(err)}`,
        { error: String(err), taskId: task.id },
      ));
    });
  }

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

  async implementTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.error('orchestrator', `implementTask: task not found: ${taskId}`);
      return;
    }

    task.implementationStatus = 'implementing';
    task.implementationError = undefined;
    this.persistTaskUpdate(task).catch(() => {});

    log.info('orchestrator', `Implementation started for "${task.title}"`, { taskId });

    eventBus.emit(createEvent(
      'implementation:started',
      `Implementation queued for "${task.title}"`,
      { taskId },
      'orchestrator',
      taskId,
    ));

    try {
      const result = await runImplementation(task);

      if (result.success) {
        task.implementationStatus = 'implemented';
        task.prUrl = result.prUrl;
        task.implementationError = undefined;
        log.info('orchestrator', `Implementation succeeded for "${task.title}" — PR: ${result.prUrl}`);

        eventBus.emit(createEvent(
          'implementation:completed',
          `Implementation completed for "${task.title}"`,
          { taskId, prUrl: result.prUrl, branchName: result.branchName },
          'orchestrator',
          taskId,
        ));
      } else {
        task.implementationStatus = 'failed';
        task.implementationError = result.error || 'Unknown error';
        log.error('orchestrator', `Implementation failed for "${task.title}": ${result.error}`);

        eventBus.emit(createEvent(
          'implementation:failed',
          `Implementation failed for "${task.title}": ${result.error}`,
          { taskId, error: result.error },
          'orchestrator',
          taskId,
        ));
      }
    } catch (err) {
      task.implementationStatus = 'failed';
      task.implementationError = String(err);
      log.error('orchestrator', `Implementation threw for "${task.title}": ${err}`);

      eventBus.emit(createEvent(
        'implementation:failed',
        `Implementation failed for "${task.title}": ${err}`,
        { taskId, error: String(err) },
        'orchestrator',
        taskId,
      ));
    }

    this.persistTaskUpdate(task).catch(() => {});
  }

  async runTests(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      log.error('orchestrator', `runTests: task not found: ${taskId}`);
      return;
    }

    // Load test environment URL from settings
    const settingsService = getSettingsService();
    const settings = await settingsService.load();
    const testEnvironmentUrl = settings.testing?.testEnvironmentUrl;

    if (!testEnvironmentUrl) {
      task.testStatus = 'failed';
      task.testError = 'Test environment URL is not configured. Set it in Settings \u2192 Testing.';
      this.persistTaskUpdate(task).catch(() => {});
      return;
    }

    task.testStatus = 'testing';
    task.testError = undefined;
    task.testReport = undefined;
    this.persistTaskUpdate(task).catch(() => {});

    log.info('orchestrator', `Test execution started for "${task.title}"`, { taskId });

    try {
      const result = await runTestExecution(task, testEnvironmentUrl);

      if (result.success) {
        task.testStatus = 'passed';
        task.testReport = result.report;
        task.testError = undefined;
        log.info('orchestrator', `Tests passed for "${task.title}" (${result.passedCount}/${(result.passedCount || 0) + (result.failedCount || 0)})`);
      } else {
        task.testStatus = 'failed';
        task.testReport = result.report;
        task.testError = result.error || 'Tests failed';
        log.error('orchestrator', `Tests failed for "${task.title}": ${result.error}`);
      }
    } catch (err) {
      task.testStatus = 'failed';
      task.testError = String(err);
      log.error('orchestrator', `Test execution threw for "${task.title}": ${err}`);

      eventBus.emit(createEvent(
        'test:failed',
        `Test execution failed for "${task.title}": ${err}`,
        { taskId, error: String(err) },
        'orchestrator',
        taskId,
      ));
    }

    this.persistTaskUpdate(task).catch(() => {});
  }
}

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
