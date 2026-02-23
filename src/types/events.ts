export type EventType =
  | 'task:created'
  | 'task:updated'
  | 'task:completed'
  | 'agent:started'
  | 'agent:thinking'
  | 'agent:tool_call'
  | 'agent:response'
  | 'agent:completed'
  | 'agent:error'
  | 'orchestrator:delegated'
  | 'orchestrator:decomposed'
  | 'orchestrator:plan_ready'
  | 'task:artifact'
  | 'task:transition_action'
  | 'task:subtask_cascade'
  | 'system:info'
  | 'system:error';

export interface AgentEvent {
  id: string;
  type: EventType;
  timestamp: string;
  agentId?: string;
  taskId?: string;
  data: Record<string, unknown>;
  message: string;
}
