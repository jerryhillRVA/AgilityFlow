/**
 * Structured logger for the agentic pipeline.
 *
 * Features:
 * - ISO timestamp prefix on every line
 * - Tag-based prefix: [agilityflow:tag]
 * - Automatic trace ID inclusion: [trace:a1b2c3d4]
 * - Configurable log level via LOG_LEVEL env var
 * - Optional file output via LOG_FILE env var (tees to file AND console)
 * - Timing and truncation helpers
 *
 * No external dependencies.
 */

import { appendFileSync } from 'node:fs';
import { getTraceContext } from './trace';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveMinLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
  if (envLevel && envLevel in LEVEL_ORDER) return envLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const MIN_LEVEL: LogLevel = resolveMinLevel();
const LOG_FILE: string | undefined = process.env.LOG_FILE || undefined;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return '';
  return ' ' + JSON.stringify(ctx);
}

function formatLine(tag: string, message: string, ctx?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const trace = getTraceContext();
  const tracePrefix = trace?.traceId ? ` [trace:${trace.traceId}]` : '';
  return `${ts} [agilityflow:${tag}]${tracePrefix} ${message}${formatContext(ctx)}`;
}

function output(consoleFn: (...args: string[]) => void, line: string): void {
  consoleFn(line);
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, line + '\n');
    } catch {
      // Silently ignore file write errors to avoid recursive logging
    }
  }
}

export const log = {
  debug(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('debug')) output(console.log, formatLine(tag, message, ctx));
  },
  info(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('info')) output(console.log, formatLine(tag, message, ctx));
  },
  warn(tag: string, message: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('warn')) output(console.warn, formatLine(tag, message, ctx));
  },
  error(tag: string, message: string, ctx?: Record<string, unknown>): void {
    // Errors always log regardless of level
    output(console.error, formatLine(tag, message, ctx));
  },
};

/**
 * Start a timer. Returns a function that, when called, returns the elapsed
 * milliseconds since the timer was started.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Truncate a string for safe logging. Appends ...[truncated] if the string
 * exceeds maxLen.
 */
export function truncate(value: string, maxLen = 200): string {
  return value.length > maxLen ? value.slice(0, maxLen) + '...[truncated]' : value;
}
