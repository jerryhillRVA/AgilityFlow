/**
 * Minimal structured logger for the agentic pipeline.
 * Wraps console with [agilityflow:tag] prefix and optional JSON context.
 * No external dependencies.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return '';
  return ' ' + JSON.stringify(ctx);
}

export const log = {
  debug(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('debug')) console.log(`[agilityflow:${tag}] ${message}${formatContext(ctx)}`);
  },
  info(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('info')) console.log(`[agilityflow:${tag}] ${message}${formatContext(ctx)}`);
  },
  warn(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('warn')) console.warn(`[agilityflow:${tag}] ${message}${formatContext(ctx)}`);
  },
  error(tag: string, message: string, ctx?: Record<string, unknown>): void {
    console.error(`[agilityflow:${tag}] ${message}${formatContext(ctx)}`);
  },
};
