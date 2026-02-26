'use client';

import type { Task, TaskStatus } from '@/types/task';
import { Paperclip, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { StatusTransitionButtons } from './StatusTransitionButtons';
import { useWorkflow } from '@/components/providers/WorkflowProvider';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  isSubtask?: boolean;
  subtaskCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  subtasks?: Task[];
}

export function TaskCard({ task, onClick, onStatusChange, isSubtask, subtaskCount, isExpanded, onToggleExpand, subtasks }: TaskCardProps) {
  const { STATUS_COLORS, getPriorityColor } = useWorkflow();
  const artifactCount = task.artifacts?.length || 0;

  // Subtask card: compact with left accent border
  if (isSubtask) {
    return (
      <div
        className="p-2 rounded border-l-2 transition-colors cursor-pointer"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          borderLeftColor: 'var(--accent-violet)',
          borderTopWidth: '1px',
          borderRightWidth: '1px',
          borderBottomWidth: '1px',
          borderTopStyle: 'solid',
          borderRightStyle: 'solid',
          borderBottomStyle: 'solid',
        }}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </div>
          <span className="text-[8px] flex-shrink-0 ml-1" style={{ color: 'var(--text-muted)' }}>
            {task.id.slice(0, 6)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task.assignedAgent && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                background: 'var(--accent-violet)15',
                color: 'var(--accent-violet)',
              }}>
                {task.assignedAgent}
              </span>
            )}
            {artifactCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--accent)' }}>
                <Paperclip size={8} />
                {artifactCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {task.usage && (
              <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {task.usage.iterations}it / {task.usage.totalInputTokens + task.usage.totalOutputTokens > 1000
                  ? `${Math.round((task.usage.totalInputTokens + task.usage.totalOutputTokens) / 1000)}K`
                  : task.usage.totalInputTokens + task.usage.totalOutputTokens} tok
              </span>
            )}
            <span className="text-[8px] px-1.5 py-0.5 rounded font-medium" style={{
              background: `${STATUS_COLORS[task.status]}20`,
              color: STATUS_COLORS[task.status],
            }}>
              {task.status}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Parent card: full size with optional expand toggle
  const hasSubtasks = (subtaskCount ?? 0) > 0;

  return (
    <div
      className="p-3 rounded border transition-colors cursor-pointer"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            background: `${getPriorityColor(task.priority)}20`,
            color: getPriorityColor(task.priority),
          }}>
          {task.priority}
        </span>
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {task.id.slice(0, 8)}
        </span>
      </div>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
        {task.title}
      </div>
      <div className="text-[10px] line-clamp-2 mb-2" style={{ color: 'var(--text-muted)' }}>
        {task.description}
      </div>
      {task.assignedAgent && (
        <div className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--accent-violet)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-violet)' }} />
          {task.assignedAgent}
        </div>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {new Date(task.updatedAt).toLocaleTimeString()}
          </span>
          {artifactCount > 0 && (
            <span className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--accent)' }}>
              <Paperclip size={9} />
              {artifactCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onStatusChange && (
            <StatusTransitionButtons task={task} onStatusChange={onStatusChange} compact subtasks={subtasks} />
          )}
        </div>
      </div>
      {/* Subtask expand toggle — rendered below the card body */}
      {hasSubtasks && (
        <button
          className="flex items-center gap-1 mt-2 pt-1.5 w-full text-[9px] font-medium transition-colors"
          style={{
            color: 'var(--accent)',
            borderTop: '1px solid var(--border)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
        >
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <Users size={9} />
          {subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
