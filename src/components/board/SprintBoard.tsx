'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Task, TaskStatus } from '@/types/task';
import { TaskCard } from './TaskCard';
import { TaskDetailPanel } from './TaskDetailPanel';

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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedSwimlanes, setExpandedSwimlanes] = useState<Set<string>>(new Set());
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
    } catch { /* ignore */ }
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
      // Immediately re-fetch to reflect the change
      await fetchTasks();
    } catch (err) {
      console.error('Status change failed:', err);
      throw err;
    }
  }

  function handleSelectTask(task: Task) {
    setSelectedTask(task);
  }

  function toggleSwimlane(taskId: string) {
    setExpandedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  // Separate parent tasks from subtasks
  const parentTasks = tasks.filter(t => !t.parentTaskId);
  const subtasksByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const list = subtasksByParent.get(t.parentTaskId) || [];
      list.push(t);
      subtasksByParent.set(t.parentTaskId, list);
    }
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
        {columns.map(({ status, label, color }) => {
          // Parent tasks in this column
          const columnParents = parentTasks.filter(t => t.status === status);
          // Orphan subtasks in this column (parent not visible — show them standalone)
          const columnOrphanSubtasks = tasks.filter(
            t => t.parentTaskId && t.status === status && !parentTasks.some(p => p.id === t.parentTaskId)
          );
          const totalCount = columnParents.length
            + columnOrphanSubtasks.length
            + columnParents.reduce((acc, p) => {
              if (!expandedSwimlanes.has(p.id) || p.status !== status) return acc;
              const subs = subtasksByParent.get(p.id) || [];
              return acc + subs.length;
            }, 0);

          return (
            <div key={status} className="flex-shrink-0 w-64">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-xs font-semibold" style={{ color }}>
                  {label}
                </span>
                <span className="text-[10px] px-1.5 rounded-full"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                  {totalCount}
                </span>
              </div>
              <div className="space-y-2 min-h-[200px] p-2 rounded"
                style={{ background: 'var(--bg-primary)', border: '1px dashed var(--border)' }}>
                {columnParents.map(parentTask => {
                  const allSubtasks = subtasksByParent.get(parentTask.id) || [];
                  const isExpanded = expandedSwimlanes.has(parentTask.id);
                  // Show ALL subtasks under parent only in the parent's own column
                  const showSubtasksHere = isExpanded && parentTask.status === status;

                  return (
                    <div key={parentTask.id}>
                      <TaskCard
                        task={parentTask}
                        onClick={() => handleSelectTask(parentTask)}
                        onStatusChange={handleStatusChange}
                        subtaskCount={allSubtasks.length}
                        isExpanded={isExpanded}
                        onToggleExpand={() => toggleSwimlane(parentTask.id)}
                        subtasks={allSubtasks}
                      />
                      {/* Inline subtasks when expanded — all subtasks shown in parent's column */}
                      {showSubtasksHere && allSubtasks.length > 0 && (
                        <div className="ml-3 mt-1 space-y-1 pl-2"
                          style={{ borderLeft: '2px solid var(--accent-violet)30' }}>
                          {allSubtasks.map(sub => (
                            <TaskCard
                              key={sub.id}
                              task={sub}
                              isSubtask
                              onClick={() => handleSelectTask(sub)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Orphan subtasks (parent missing from task list) */}
                {columnOrphanSubtasks.map(sub => (
                  <TaskCard
                    key={sub.id}
                    task={sub}
                    isSubtask
                    onClick={() => handleSelectTask(sub)}
                  />
                ))}
                {columnParents.length === 0 && columnOrphanSubtasks.length === 0 && (
                  <div className="text-[10px] text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onSelectTask={handleSelectTask}
        />
      )}
    </>
  );
}
