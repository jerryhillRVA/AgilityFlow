import { AgentExecutor } from './executor';
import { PromptAssembler } from './prompt-assembler';
import { createAdapter } from './adapters';
import { ToolRouter } from './tools/tool-router';
import { registerAgenticFSTools } from './tools/agentic-fs-tool';
import { getRegistry, type CapabilityRegistry } from './registry';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { v4 as uuid } from 'uuid';

export class Orchestrator {
  private registry!: CapabilityRegistry;
  private executor!: AgentExecutor;
  private toolRouter!: ToolRouter;
  private tasks: Map<string, Task> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.registry = await getRegistry();
    const assembler = new PromptAssembler(this.registry);
    const adapter = createAdapter();
    this.toolRouter = new ToolRouter();

    // Register Agentic FS tools
    registerAgenticFSTools(this.toolRouter);

    // Register orchestration tools
    this.registerOrchestrationTools(assembler, adapter);

    this.executor = new AgentExecutor(assembler, adapter, this.toolRouter);
    this.initialized = true;

    eventBus.emit(createEvent(
      'system:info',
      `Orchestrator initialized with ${this.registry.agents.size} agents, ${this.registry.skills.size} skills (adapter: ${adapter.name})`,
    ));
  }

  private registerOrchestrationTools(assembler: PromptAssembler, adapter: ReturnType<typeof createAdapter>): void {
    // delegate_to_agent: runs a sub-agent in-process
    this.toolRouter.register('delegate_to_agent', async (input) => {
      const agentId = input.agent_id as string;
      const agent = this.registry.getAgent(agentId);
      if (!agent) return { error: `Agent not found: ${agentId}` };

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

      // Execute the subtask with a fresh executor for the sub-agent
      const subExecutor = new AgentExecutor(assembler, adapter, this.toolRouter);
      try {
        this.updateTaskStatus(subtask.id, 'in-progress');
        const result = await subExecutor.execute(agentId, subtask);
        this.updateTaskStatus(subtask.id, 'done');
        return { taskId: subtask.id, agentId, result: result.response.slice(0, 500) };
      } catch (error) {
        this.updateTaskStatus(subtask.id, 'blocked');
        return { taskId: subtask.id, agentId, error: String(error) };
      }
    });

    // create_subtask: creates a new task
    this.toolRouter.register('create_subtask', async (input) => {
      const task = this.createTask({
        title: input.title as string,
        description: input.description as string,
        priority: (input.priority as TaskPriority) || 'medium',
      });
      return { taskId: task.id, title: task.title, status: task.status };
    });

    // update_task_status
    this.toolRouter.register('update_task_status', async (input) => {
      const taskId = input.task_id as string;
      const status = input.status as TaskStatus;
      this.updateTaskStatus(taskId, status);
      return { taskId, status };
    });
  }

  async submitTask(title: string, description: string, priority?: string): Promise<Task> {
    await this.initialize();

    const task = this.createTask({
      title,
      description,
      priority: (priority as TaskPriority) || 'medium',
    });

    eventBus.emit(createEvent(
      'task:created',
      `Task created: ${title}`,
      { taskId: task.id, title },
    ));

    // Try to persist to Agentic FS (non-blocking, best-effort)
    this.persistTask(task).catch(() => {});

    // Execute orchestrator asynchronously
    this.executeAsync(task);

    return task;
  }

  private async persistTask(task: Task): Promise<void> {
    try {
      const fs = getAgenticFSClient();
      const result = await fs.uploadFile(
        JSON.stringify(task, null, 2),
        `${task.id}.json`,
        { namespace: 'tasks', path: task.status, tags: ['task', task.priority] }
      );
      task.fileId = result.file_id;
    } catch {
      // Agentic FS may not be available; continue without persistence
    }
  }

  private async executeAsync(task: Task): Promise<void> {
    try {
      this.updateTaskStatus(task.id, 'in-progress');
      await this.executor.execute('orchestrator', task);
      this.updateTaskStatus(task.id, 'done');
    } catch (error) {
      eventBus.emit(createEvent(
        'agent:error',
        `Orchestrator error: ${String(error)}`,
        { error: String(error) },
        'orchestrator',
        task.id,
      ));
      this.updateTaskStatus(task.id, 'blocked');
    }
  }

  private createTask(params: { title: string; description: string; priority?: TaskPriority; assignedAgent?: string; parentTaskId?: string }): Task {
    const task: Task = {
      id: uuid(),
      title: params.title,
      description: params.description,
      status: 'todo',
      priority: params.priority || 'medium',
      assignedAgent: params.assignedAgent,
      parentTaskId: params.parentTaskId,
      subtaskIds: [],
      tags: [],
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

let orchestrator: Orchestrator | null = null;
export async function getOrchestrator(): Promise<Orchestrator> {
  if (!orchestrator) {
    orchestrator = new Orchestrator();
    await orchestrator.initialize();
  }
  return orchestrator;
}
