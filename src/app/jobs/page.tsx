'use client';

import { useEffect, useState } from 'react';
import { TaskSubmitForm } from '@/components/agent/TaskSubmitForm';
import type { Task } from '@/types/task';

export default function JobsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  function refresh() {
    fetch('/api/tasks').then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Jobs</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        Submit tasks to the orchestrator and monitor execution.
      </p>

      <div className="grid grid-cols-2 gap-6">
        <div className="p-5 rounded-lg border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-amber)' }}>
            Do Work
          </h2>
          <TaskSubmitForm onSubmitted={refresh} />
        </div>

        <div className="p-5 rounded-lg border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-blue)' }}>
            Task History ({tasks.length})
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tasks.map(task => (
              <div key={task.id} className="p-2 rounded text-xs border"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {task.title}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      background: task.status === 'done' ? 'rgba(52,211,153,0.15)' :
                        task.status === 'in-progress' ? 'rgba(99,102,241,0.15)' : 'rgba(100,116,139,0.15)',
                      color: task.status === 'done' ? 'var(--accent-green)' :
                        task.status === 'in-progress' ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {task.status}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>{task.description.slice(0, 100)}</div>
                {task.assignedAgent && (
                  <div className="mt-1" style={{ color: 'var(--accent-violet)' }}>
                    Agent: {task.assignedAgent}
                  </div>
                )}
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No tasks yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
