/**
 * API route logging wrapper.
 *
 * Wraps Next.js App Router handlers with:
 * - Trace ID generation (via AsyncLocalStorage)
 * - Request entry logging (method, path)
 * - Response exit logging (status, elapsed ms)
 * - Unhandled error logging with stack traces
 *
 * All output goes to both console and LOG_FILE (if set).
 */

import { NextRequest, NextResponse } from 'next/server';
import { log, startTimer } from './agentic/logger';
import { withTraceAsync, generateTraceId } from './agentic/trace';

/**
 * Wraps an API route handler with logging and trace context.
 *
 * Supports handlers with any of these signatures:
 * - (request: NextRequest, context: { params: ... }) => Promise<NextResponse>
 * - (request: NextRequest) => Promise<NextResponse>
 * - () => Promise<NextResponse>
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withApiLogging<T extends (...args: any[]) => Promise<NextResponse | Response>>(
  handler: T,
  routeTag: string,
): T {
  const wrapped = async (...args: Parameters<T>): Promise<NextResponse | Response> => {
    const traceId = generateTraceId();
    const elapsed = startTimer();

    // Extract method and path from the request if available
    const request = args[0] instanceof NextRequest ? args[0] : undefined;
    const method = request?.method ?? 'GET';
    const path = request?.nextUrl?.pathname ?? `(${routeTag})`;

    return withTraceAsync({ traceId }, async () => {
      log.info('api', `→ ${method} ${path}`, { traceId });

      try {
        const response = await handler(...args);
        const status = response.status;

        log.info('api', `← ${method} ${path} ${status}`, {
          traceId,
          status,
          elapsedMs: elapsed(),
        });

        return response;
      } catch (error) {
        log.error('api', `← ${method} ${path} 500 (unhandled)`, {
          traceId,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
          elapsedMs: elapsed(),
        });
        throw error;
      }
    });
  };

  return wrapped as T;
}
