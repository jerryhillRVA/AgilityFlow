'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentEvent } from '@/types/events';

const eventTypeColors: Record<string, string> = {
  'task:created': 'var(--accent-blue)',
  'task:updated': 'var(--accent-cyan)',
  'task:completed': 'var(--accent-green)',
  'task:artifact': 'var(--accent-cyan)',
  'agent:started': 'var(--accent-amber)',
  'agent:thinking': 'var(--accent-violet)',
  'agent:tool_call': 'var(--accent-orange)',
  'agent:response': 'var(--accent-blue)',
  'agent:completed': 'var(--accent-green)',
  'agent:error': 'var(--accent-red)',
  'orchestrator:delegated': 'var(--accent-amber)',
  'orchestrator:decomposed': 'var(--accent-amber)',
  'orchestrator:plan_ready': 'var(--accent-violet)',
  'task:transition_action': 'var(--accent-amber)',
  'task:subtask_cascade': 'var(--accent-green)',
  'system:info': 'var(--text-muted)',
  'system:error': 'var(--accent-red)',
};

/** Render event data in a readable format based on event type */
function renderEventData(event: AgentEvent): React.ReactNode {
  const data = event.data;
  if (!data || Object.keys(data).length === 0) return null;

  // Cast data fields to string safely via helper
  const d = data as Record<string, unknown>;
  const has = (key: string) => d[key] !== undefined && d[key] !== null;
  const str = (key: string) => String(d[key]);

  switch (event.type) {
    case 'agent:tool_call':
      return (
        <div className="space-y-1">
          {has('tool') && <DataField label="Tool" value={str('tool')} />}
          {has('input') && (
            <div>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Input:</span>
              <pre className="text-[9px] mt-0.5 p-1.5 rounded overflow-x-auto whitespace-pre-wrap break-all"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                {typeof d.input === 'string' ? d.input : JSON.stringify(d.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );

    case 'agent:completed':
      return (
        <div className="space-y-1">
          {has('response') && <DataField label="Response" value={str('response')} pre />}
          {has('artifacts') && <DataField label="Artifacts" value={str('artifacts')} />}
        </div>
      );

    case 'agent:error':
      return (
        <div className="p-1.5 rounded" style={{ background: 'rgba(248, 113, 113, 0.1)' }}>
          <pre className="text-[9px] whitespace-pre-wrap break-all" style={{ color: 'var(--accent-red)' }}>
            {has('error') ? str('error') : JSON.stringify(d, null, 2)}
          </pre>
        </div>
      );

    case 'task:created':
    case 'task:updated':
      return (
        <div className="space-y-1">
          {has('taskId') && <DataField label="Task ID" value={str('taskId')} mono />}
          {has('status') && <DataField label="Status" value={str('status')} />}
          {has('title') && <DataField label="Title" value={str('title')} />}
          {has('executionMode') && <DataField label="Mode" value={str('executionMode')} />}
          {has('manual') && <DataField label="Source" value="Manual transition" />}
        </div>
      );

    case 'task:artifact':
      return (
        <div className="space-y-1">
          {has('filename') && <DataField label="File" value={str('filename')} />}
          {has('fileId') && <DataField label="File ID" value={str('fileId')} mono />}
          {has('taskId') && <DataField label="Task ID" value={str('taskId')} mono />}
        </div>
      );

    case 'task:transition_action':
      return (
        <div className="space-y-1">
          {has('taskId') && <DataField label="Task ID" value={str('taskId')} mono />}
          {has('transition') && <DataField label="Transition" value={str('transition')} />}
          {has('action') && <DataField label="Action" value={str('action')} />}
          {has('agentId') && <DataField label="Agent" value={str('agentId')} />}
        </div>
      );

    case 'task:subtask_cascade':
      return (
        <div className="space-y-1">
          {has('parentTaskId') && <DataField label="Parent Task" value={str('parentTaskId')} mono />}
          {has('subtaskId') && <DataField label="Subtask" value={str('subtaskId')} mono />}
          {has('from') && <DataField label="From" value={str('from')} />}
          {has('to') && <DataField label="To" value={str('to')} />}
        </div>
      );

    case 'orchestrator:plan_ready':
      return (
        <div className="space-y-1">
          {has('taskId') && <DataField label="Task ID" value={str('taskId')} mono />}
          {has('subtaskCount') && <DataField label="Subtasks" value={str('subtaskCount')} />}
        </div>
      );

    case 'orchestrator:delegated':
      return (
        <div className="space-y-1">
          {has('agentId') && <DataField label="Delegated to" value={str('agentId')} />}
          {has('taskId') && <DataField label="Task ID" value={str('taskId')} mono />}
        </div>
      );

    case 'agent:thinking':
      return (
        <div className="space-y-1">
          {has('iteration') && has('maxIterations') && (
            <DataField label="Iteration" value={`${str('iteration')} / ${str('maxIterations')}`} />
          )}
          {has('inputTokenDelta') && (
            <DataField label="Input Tokens (this iter)" value={str('inputTokenDelta')} mono />
          )}
          {has('outputTokenDelta') && (
            <DataField label="Output Tokens (this iter)" value={str('outputTokenDelta')} mono />
          )}
          {has('totalInputTokens') && (
            <DataField label="Total Input" value={str('totalInputTokens')} mono />
          )}
          {has('totalOutputTokens') && (
            <DataField label="Total Output" value={str('totalOutputTokens')} mono />
          )}
        </div>
      );

    default:
      // Generic: render all data keys
      return (
        <div className="space-y-1">
          {Object.entries(d).map(([key, value]) => (
            <DataField key={key} label={key} value={typeof value === 'string' ? value : JSON.stringify(value)} />
          ))}
        </div>
      );
  }
}

function DataField({ label, value, mono, pre }: { label: string; value: string; mono?: boolean; pre?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}:</span>
      {pre ? (
        <pre className="text-[9px] whitespace-pre-wrap break-all flex-1" style={{ color: 'var(--text-secondary)' }}>
          {value}
        </pre>
      ) : (
        <span className={`text-[9px] break-all ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-secondary)' }}>
          {value}
        </span>
      )}
    </div>
  );
}

export function ActivityFeed() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function toggleExpand(eventId: string) {
    setExpandedId(prev => prev === eventId ? null : eventId);
  }

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

      {events.map((event) => {
        const isExpanded = expandedId === event.id;
        const hasData = event.data && Object.keys(event.data).length > 0;

        return (
          <div
            key={event.id}
            className={`p-2 rounded text-xs transition-colors ${hasData ? 'cursor-pointer' : ''}`}
            style={{ background: isExpanded ? 'var(--bg-hover)' : 'var(--bg-tertiary)' }}
            onClick={() => hasData && toggleExpand(event.id)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                {hasData && (
                  isExpanded
                    ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />
                )}
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    color: eventTypeColors[event.type] || 'var(--text-muted)',
                    background: 'var(--bg-primary)',
                  }}>
                  {event.type}
                </span>
              </div>
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{event.message}</div>
            <div className="flex items-center gap-3 mt-1">
              {event.agentId && (
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  Agent: {event.agentId}
                </span>
              )}
              {event.taskId && (
                <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Task: {event.taskId.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Expanded detail section */}
            {isExpanded && hasData && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                {renderEventData(event)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
