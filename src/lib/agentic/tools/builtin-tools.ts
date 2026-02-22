import type { ToolSchema } from '../adapters/model-adapter';

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  agentic_fs_read: {
    name: 'agentic_fs_read',
    description: 'Read a file from the project filesystem by its file ID',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: 'The file ID to read' },
      },
      required: ['file_id'],
    },
  },
  agentic_fs_write: {
    name: 'agentic_fs_write',
    description: 'Write or upload a file to the project filesystem',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Name for the file' },
        content: { type: 'string', description: 'File content' },
        namespace: { type: 'string', description: 'Namespace (e.g. artifacts, tasks)' },
        path: { type: 'string', description: 'Path within the namespace' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      },
      required: ['filename', 'content'],
    },
  },
  agentic_fs_search: {
    name: 'agentic_fs_search',
    description: 'Search files in the project by content or meaning using hybrid search',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        namespace: { type: 'string', description: 'Namespace to search within' },
        k: { type: 'number', description: 'Number of results (default 10)' },
      },
      required: ['query'],
    },
  },
  agentic_fs_list: {
    name: 'agentic_fs_list',
    description: 'List directory contents in the project filesystem',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        namespace: { type: 'string', description: 'Namespace' },
      },
      required: ['path'],
    },
  },
  delegate_to_agent: {
    name: 'delegate_to_agent',
    description: 'Delegate a subtask to a specialist agent for execution',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'ID of the agent to delegate to' },
        task_title: { type: 'string', description: 'Title of the subtask' },
        task_description: { type: 'string', description: 'Detailed description of what to do' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Task priority' },
      },
      required: ['agent_id', 'task_title', 'task_description'],
    },
  },
  create_subtask: {
    name: 'create_subtask',
    description: 'Create a subtask under the current task',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Subtask title' },
        description: { type: 'string', description: 'Subtask description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      },
      required: ['title', 'description'],
    },
  },
  update_task_status: {
    name: 'update_task_status',
    description: 'Update the status of a task',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done', 'blocked'] },
      },
      required: ['task_id', 'status'],
    },
  },
};

export function getToolSchema(name: string): ToolSchema | undefined {
  return TOOL_SCHEMAS[name];
}

export function getToolSchemas(names: string[]): ToolSchema[] {
  return names.map(n => TOOL_SCHEMAS[n]).filter(Boolean);
}
