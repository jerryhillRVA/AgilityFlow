import { v4 as uuid } from 'uuid';
import type { AgentEvent, EventType } from '@/types/events';

export type { AgentEvent, EventType } from '@/types/events';

export function createEvent(
  type: EventType,
  message: string,
  data?: Record<string, unknown>,
  agentId?: string,
  taskId?: string,
): AgentEvent {
  return {
    id: uuid(),
    type,
    timestamp: new Date().toISOString(),
    agentId,
    taskId,
    data: data || {},
    message,
  };
}
