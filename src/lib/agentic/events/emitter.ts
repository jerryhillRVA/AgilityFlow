import type { AgentEvent } from '@/types/events';

type EventListener = (event: AgentEvent) => void;

class EventBus {
  private listeners: Set<EventListener> = new Set();
  private buffer: AgentEvent[] = [];
  private maxBuffer = 200;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore failed listeners */ }
    }
  }

  getRecent(count?: number): AgentEvent[] {
    return this.buffer.slice(-(count || 50));
  }

  clear(): void {
    this.buffer = [];
  }
}

// Use globalThis to ensure a single instance survives Turbopack module isolation in dev mode
const globalKey = '__agilityflow_eventBus__' as const;
export const eventBus: EventBus = (globalThis as Record<string, unknown>)[globalKey] as EventBus
  ?? ((globalThis as Record<string, unknown>)[globalKey] = new EventBus());
