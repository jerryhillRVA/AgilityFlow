import type { AgentEvent } from '@/types/events';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS, paths } from '../fs-paths';
import { log } from '../logger';

type EventListener = (event: AgentEvent) => void;

class EventBus {
  private listeners: Set<EventListener> = new Set();
  private buffer: AgentEvent[] = [];
  private maxBuffer = 200;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    log.debug('event-bus', `Subscriber added`, { subscriberCount: this.listeners.size });
    return () => {
      this.listeners.delete(listener);
      log.debug('event-bus', `Subscriber removed`, { subscriberCount: this.listeners.size });
    };
  }

  emit(event: AgentEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore failed listeners */ }
    }

    // Persist to Agentic FS (fire-and-forget, non-blocking)
    this.persistEvent(event);
  }

  getRecent(count?: number): AgentEvent[] {
    return this.buffer.slice(-(count || 50));
  }

  clear(): void {
    this.buffer = [];
  }

  /** Write event to Agentic FS events namespace. Never throws — failures are logged and ignored. */
  private persistEvent(event: AgentEvent): void {
    try {
      const date = event.timestamp.slice(0, 10); // YYYY-MM-DD
      const fs = getAgenticFSClient();
      fs.uploadFile(
        JSON.stringify(event),
        `${event.id}.json`,
        { namespace: NS.EVENTS, path: paths.events.dir(date) },
      ).catch((err) => {
        log.warn('event-bus', `Failed to persist event ${event.id}`, { error: String(err) });
      });
    } catch (err) {
      log.warn('event-bus', `Failed to persist event ${event.id}`, { error: String(err) });
    }
  }
}

// Use globalThis to ensure a single instance survives Turbopack module isolation in dev mode
const globalKey = '__agilityflow_eventBus__' as const;
export const eventBus: EventBus = (globalThis as Record<string, unknown>)[globalKey] as EventBus
  ?? ((globalThis as Record<string, unknown>)[globalKey] = new EventBus());
