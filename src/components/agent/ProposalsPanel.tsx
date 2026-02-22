'use client';

import { useEffect, useState } from 'react';
import type { Task } from '@/types/task';

export function ProposalsPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      } catch { /* ignore */ }
    }
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeTasks = tasks.filter(t => t.status === 'in-progress' || t.status === 'todo');

  return (
    <div className="space-y-3">
      {activeTasks.length === 0 && (
        <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
          No active tasks. Submit a task to get started.
        </div>
      )}
      {activeTasks.map((task) => (
        <div key={task.id} className="p-3 rounded border"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{
                background: task.status === 'in-progress' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 166, 35, 0.15)',
                color: task.status === 'in-progress' ? 'var(--accent)' : 'var(--accent-amber)',
              }}>
              {task.status}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-muted)',
              }}>
              {task.priority}
            </span>
          </div>
          <div className="text-xs font-medium mt-1" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </div>
          {task.assignedAgent && (
            <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Assigned: {task.assignedAgent}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
