import { eventBus } from '@/lib/agentic/events/emitter';
import { log } from '@/lib/agentic/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  log.info('api:events', 'SSE connection opened');

  const stream = new ReadableStream({
    start(controller) {
      // Send recent events as initial state
      const recent = eventBus.getRecent(20);
      for (const event of recent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // Subscribe to new events
      const unsubscribe = eventBus.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          log.debug('api:events', 'SSE connection closed (write failed)');
          unsubscribe();
        }
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          log.debug('api:events', 'SSE connection closed (heartbeat failed)');
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);
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
