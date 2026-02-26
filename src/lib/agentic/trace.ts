/**
 * Trace context for correlating log entries across the async agentic pipeline.
 * Uses Node.js AsyncLocalStorage (stable in Node 22, zero dependencies) so the
 * trace ID propagates automatically through async/await chains without manual passing.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContext {
  /** Unique ID for the entire request/task lifecycle */
  traceId: string;
  /** Current task being processed */
  taskId?: string;
  /** Current agent executing */
  agentId?: string;
}

const traceStore = new AsyncLocalStorage<TraceContext>();

/** Get the current trace ID, or undefined if not in a traced context. */
export function getTraceId(): string | undefined {
  return traceStore.getStore()?.traceId;
}

/** Get the full trace context, or undefined if not in a traced context. */
export function getTraceContext(): TraceContext | undefined {
  return traceStore.getStore();
}

/** Run an async callback within a trace context. Nests correctly with AsyncLocalStorage. */
export function withTraceAsync<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  return traceStore.run(ctx, fn);
}

/** Generate a short random trace ID (8 hex chars). */
export function generateTraceId(): string {
  return Math.random().toString(16).slice(2, 10);
}
