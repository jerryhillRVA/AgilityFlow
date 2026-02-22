import { SprintBoard } from '@/components/board/SprintBoard';

export default function SprintPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Sprint Board</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        Kanban view of current sprint tasks. Auto-refreshes every 3 seconds.
      </p>
      <SprintBoard />
    </div>
  );
}
