import type { Task } from '@/types/task';

const priorityColors: Record<string, string> = {
  critical: 'var(--accent-red)',
  high: 'var(--accent-orange)',
  medium: 'var(--accent-amber)',
  low: 'var(--accent-green)',
};

export function TaskCard({ task }: { task: Task }) {
  return (
    <div className="p-3 rounded border transition-colors"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            background: `${priorityColors[task.priority]}20`,
            color: priorityColors[task.priority],
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
      <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {new Date(task.updatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
