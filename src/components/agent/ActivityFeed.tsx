'use client';

import { useEffect, useState } from 'react';
import type { AgentEvent } from '@/types/events';

const eventTypeColors: Record<string, string> = {
  'task:created': 'var(--accent-blue)',
  'task:updated': 'var(--accent-cyan)',
  'task:completed': 'var(--accent-green)',
  'agent:started': 'var(--accent-amber)',
  'agent:thinking': 'var(--accent-violet)',
  'agent:tool_call': 'var(--accent-orange)',
  'agent:completed': 'var(--accent-green)',
  'agent:error': 'var(--accent-red)',
  'orchestrator:delegated': 'var(--accent-amber)',
  'system:info': 'var(--text-muted)',
  'system:error': 'var(--accent-red)',
};

export function ActivityFeed() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents(prev => [event, ...prev].slice(0, 100));
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => eventSource.close();
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full"
          style={{ background: connected ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {connected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      {events.length === 0 && (
        <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
          No activity yet. Submit a task to see agent events.
        </div>
      )}

      {events.map((event) => (
        <div key={event.id} className="p-2 rounded text-xs"
          style={{ background: 'var(--bg-tertiary)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{
                color: eventTypeColors[event.type] || 'var(--text-muted)',
                background: 'var(--bg-primary)',
              }}>
              {event.type}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{event.message}</div>
          {event.agentId && (
            <div className="mt-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              Agent: {event.agentId}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
