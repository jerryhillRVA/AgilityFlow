'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { TaskSubmitForm } from '@/components/agent/TaskSubmitForm';
import type { Task, TaskStatus } from '@/types/task';
import { TaskDetailPanel } from '@/components/board/TaskDetailPanel';

export default function JobsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const selectedTaskRef = useRef<Task | null>(null);

  // Keep ref in sync so the stable fetchTasks can read it without re-creating
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      const taskList = Array.isArray(data) ? data : [];
      setTasks(taskList);
      // Update selected task if panel is open (keeps it fresh)
      const current = selectedTaskRef.current;
      if (current) {
        const updated = taskList.find((t: Task) => t.id === current.id);
        if (updated) setSelectedTask(updated);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  async function handleStatusChange(taskId: string, newStatus: TaskStatus): Promise<void> {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Transition failed');
      }
      await fetchTasks();
    } catch (err) {
      console.error('Status change failed:', err);
      throw err;
    }
  }

  return (
    <>
      <div className="max-w-4xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Jobs</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Submit tasks to the orchestrator and monitor execution.
        </p>

        <div className="grid grid-cols-2 gap-6">
          <div className="p-5 rounded-lg card-elevated animate-fade-in-up">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-amber)' }}>
              Do Work
            </h2>
            <TaskSubmitForm onSubmitted={fetchTasks} />
          </div>

          <div className="p-5 rounded-lg card-elevated animate-fade-in-up"
            style={{ animationDelay: '75ms' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-blue)' }}>
              Task History ({tasks.length})
            </h2>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {tasks.map(task => {
                const isSelected = selectedTask?.id === task.id;
                return (
                  <div
                    key={task.id}
                    className="p-2 rounded text-xs elevation-1 cursor-pointer transition-colors duration-150 hover:opacity-80"
                    style={{
                      background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      borderLeft: isSelected ? '3px solid var(--accent-secondary)' : undefined,
                    }}
                    onClick={() => setSelectedTask(isSelected ? null : task)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTask(isSelected ? null : task);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${task.title}`}
                    aria-pressed={isSelected}
                  >
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
                );
              })}
              {tasks.length === 0 && (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No tasks yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onSelectTask={(task) => setSelectedTask(task)}
        />
      )}
    </>
  );
}
