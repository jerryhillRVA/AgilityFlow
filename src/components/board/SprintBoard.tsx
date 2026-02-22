'use client';

import { useEffect, useState } from 'react';
import type { Task, TaskStatus } from '@/types/task';
import { TaskCard } from './TaskCard';

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: 'var(--text-muted)' },
  { status: 'todo', label: 'To Do', color: 'var(--accent-blue)' },
  { status: 'in-progress', label: 'In Progress', color: 'var(--accent-amber)' },
  { status: 'review', label: 'Review', color: 'var(--accent-violet)' },
  { status: 'done', label: 'Done', color: 'var(--accent-green)' },
  { status: 'blocked', label: 'Blocked', color: 'var(--accent-red)' },
];

export function SprintBoard() {
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
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
      {columns.map(({ status, label, color }) => {
        const columnTasks = tasks.filter(t => t.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-64">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-xs font-semibold" style={{ color }}>
                {label}
              </span>
              <span className="text-[10px] px-1.5 rounded-full"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                {columnTasks.length}
              </span>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 rounded"
              style={{ background: 'var(--bg-primary)', border: '1px dashed var(--border)' }}>
              {columnTasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
              {columnTasks.length === 0 && (
                <div className="text-[10px] text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
