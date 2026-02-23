'use client';

import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { Task } from '@/types/task';

export default function BacklogPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
    const interval = setInterval(() => {
      fetch('/api/tasks').then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Backlog</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        All tasks across all statuses. {tasks.length} total.
      </p>

      <div className="rounded-lg border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>ID</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Title</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Status</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Priority</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Agent</th>
              <th className="text-left p-3 font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="p-3 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{task.id.slice(0, 8)}</td>
                <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                  <div className="flex items-center gap-1.5">
                    <span>{task.title}</span>
                    {task.artifacts && task.artifacts.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] shrink-0" style={{ color: 'var(--accent)' }}>
                        <Paperclip size={9} />
                        {task.artifacts.length}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <span className="px-1.5 py-0.5 rounded text-[9px]"
                    style={{
                      background: task.status === 'done' ? 'rgba(52,211,153,0.15)' :
                        task.status === 'in-progress' ? 'rgba(99,102,241,0.15)' : 'rgba(100,116,139,0.15)',
                      color: task.status === 'done' ? 'var(--accent-green)' :
                        task.status === 'in-progress' ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {task.status}
                  </span>
                </td>
                <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{task.priority}</td>
                <td className="p-3" style={{ color: 'var(--accent-violet)' }}>{task.assignedAgent || '—'}</td>
                <td className="p-3" style={{ color: 'var(--text-muted)' }}>{new Date(task.updatedAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <div className="text-center py-12 text-xs" style={{ color: 'var(--text-muted)' }}>No tasks in the backlog</div>
        )}
      </div>
    </div>
  );
}
