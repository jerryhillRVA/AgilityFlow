export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  parentTaskId?: string;
  subtaskIds: string[];
  sprintId?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  fileId?: string;
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
