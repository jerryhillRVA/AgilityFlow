export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done' | 'blocked' | 'pending';
/** Valid statuses for subtasks. Subtask lifecycle: pending → in-progress → done (or blocked). */
export type SubtaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type ExecutionMode = 'plan' | 'execute';
export type ArtifactCategory = 'requirements' | 'implementation' | 'verification' | 'other';

export function isSubtask(task: Task): boolean {
  return !!task.parentTaskId;
}

export interface IterationRecord {
  iteration: number;
  inputTokenDelta: number;
  outputTokenDelta: number;
  toolCalls: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  executionMode: ExecutionMode;
  assignedAgent?: string;
  parentTaskId?: string;
  subtaskIds: string[];
  /** Wave number for sequential execution (1=first, 2=second, etc.) — set by orchestrator */
  executionOrder?: number;
  /** Subtask IDs that must complete before this one runs */
  dependsOn?: string[];
  sprintId?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  fileId?: string;
  /** Orchestrator's plan summary — populated after planning phase */
  planSummary?: string;
  /** Artifacts produced by agents during execution — linked FS files */
  artifacts?: TaskArtifact[];
  /** Agent execution result summary */
  result?: string;
  /** Token usage from agent execution */
  usage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    iterations: number;
    iterationDetails?: IterationRecord[];
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  /** Error message if the agent failed */
  errorMessage?: string;
}

export interface TaskArtifact {
  fileId: string;
  filename: string;
  namespace: string;
  path: string;
  createdAt: string;
  category: ArtifactCategory;
}

export interface WaveExecution {
  waveNumber: number;
  subtaskIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: 'planning' | 'active' | 'review' | 'completed';
  taskIds: string[];
  startDate?: string;
  endDate?: string;
}
