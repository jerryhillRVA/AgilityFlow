import { eventBus } from '@/lib/agentic/events/emitter';
import { log } from '@/lib/agentic/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  log.info('api:events', 'SSE connection opened');

  // Hoist cleanup handles so both `start` and `cancel` can access them
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream({
    start(controller) {
      // Send recent events as initial state (larger replay buffer for reconnections)
      const recent = eventBus.getRecent(100);
      for (const event of recent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // Subscribe to new events
      unsubscribe = eventBus.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          log.debug('api:events', 'SSE connection closed (write failed)');
          cleanup();
        }
      });

      // Heartbeat every 15s (faster detection of dead connections)
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          log.debug('api:events', 'SSE connection closed (heartbeat failed)');
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      log.debug('api:events', 'SSE stream cancelled (client disconnected)');
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
