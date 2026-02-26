'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft, Ban, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { Task, TaskStatus } from '@/types/task';
import { useWorkflow } from '@/components/providers/WorkflowProvider';

interface StatusTransitionButtonsProps {
  task: Task;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  compact?: boolean;
  subtasks?: Task[];
}

const TRANSITION_ICONS: Record<string, typeof ChevronRight> = {
  'done': CheckCircle2,
  'blocked': Ban,
};

export function StatusTransitionButtons({ task, onStatusChange, compact, subtasks }: StatusTransitionButtonsProps) {
  const [loading, setLoading] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { getValidTransitions, getTransitionLabel, STATUS_COLORS } = useWorkflow();
  const validTransitions = getValidTransitions(task.status);

  // Subtask status is agent-managed — no manual transitions
  if (task.parentTaskId) return null;

  // Block transitions from backlog while decomposition is in progress
  if (task.status === 'backlog' && task.decompositionComplete === false) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-violet)' }}>
        <Loader2 size={12} className="animate-spin" />
        Planning in progress...
      </div>
    );
  }

  if (validTransitions.length === 0) return null;

  // Check if the review transition is blocked by subtasks not yet done
  function isReviewBlocked(target: TaskStatus): boolean {
    if (target !== 'review' || task.status !== 'in-progress') return false;
    if (!subtasks || subtasks.length === 0) return false;
    return subtasks.some(s => s.status !== 'done');
  }

  function getBlockedCount(): number {
    if (!subtasks) return 0;
    return subtasks.filter(s => s.status !== 'done').length;
  }

  async function handleClick(newStatus: TaskStatus, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (loading) return;
    setError(null);
    setLoading(newStatus);
    try {
      await onStatusChange(task.id, newStatus);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  }

  // Compact mode: show only the primary forward transition as an icon button
  if (compact) {
    const primary = validTransitions[0];
    const Icon = TRANSITION_ICONS[primary] || ChevronRight;
    const isLoading = loading === primary;
    const blocked = isReviewBlocked(primary);

    return (
      <button
        onClick={(e) => !blocked && handleClick(primary, e)}
        disabled={!!loading || blocked}
        title={blocked ? `${getBlockedCount()} subtask(s) not yet done` : getTransitionLabel(task.status, primary)}
        className="p-1 rounded transition-colors disabled:opacity-50"
        style={{
          background: 'var(--bg-tertiary)',
          color: blocked ? 'var(--text-muted)' : (STATUS_COLORS[primary] || 'var(--accent)'),
        }}
      >
        {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      </button>
    );
  }

  // Full mode: show all valid transitions with labels
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {validTransitions.map((target, idx) => {
          const label = getTransitionLabel(task.status, target);
          const isForward = idx === 0;
          const Icon = TRANSITION_ICONS[target] || (isForward ? ChevronRight : ChevronLeft);
          const isLoading = loading === target;
          const blocked = isReviewBlocked(target);

          return (
            <button
              key={target}
              onClick={(e) => !blocked && handleClick(target, e)}
              disabled={!!loading || blocked}
              title={blocked ? `${getBlockedCount()} subtask(s) not yet done` : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
              style={{
                background: blocked ? 'var(--bg-tertiary)' : (isForward ? STATUS_COLORS[target] : 'var(--bg-tertiary)'),
                color: blocked ? 'var(--text-muted)' : (isForward ? 'white' : STATUS_COLORS[target] || 'var(--text-secondary)'),
                border: isForward && !blocked ? 'none' : '1px solid var(--border)',
              }}
            >
              {isLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : blocked ? (
                <AlertCircle size={12} />
              ) : (
                <Icon size={12} />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {/* Show blocked subtask info */}
      {subtasks && subtasks.length > 0 && task.status === 'in-progress' && getBlockedCount() > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--accent-amber)15', color: 'var(--accent-amber)' }}>
          <AlertCircle size={10} />
          {getBlockedCount()} of {subtasks.length} subtask(s) not yet done
        </div>
      )}

      {error && (
        <div className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--accent-red)15', color: 'var(--accent-red)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
