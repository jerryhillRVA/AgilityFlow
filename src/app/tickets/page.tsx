'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Ticket, Search, Paperclip, GitBranch } from 'lucide-react';
import type { Task, TaskStatus } from '@/types/task';
import { TaskDetailPanel } from '@/components/board/TaskDetailPanel';
import { useWorkflow } from '@/components/providers/WorkflowProvider';

export default function TicketsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const selectedTaskRef = useRef<Task | null>(null);
  const { STATUS_COLORS, getPriorityColor, config } = useWorkflow();

  const STATUS_OPTIONS = useMemo(() => [
    { value: 'all', label: 'All Statuses' },
    ...Object.entries(config.statuses).map(([id, cfg]) => ({ value: id, label: cfg.label })),
  ], [config.statuses]);

  const PRIORITY_OPTIONS = useMemo(() => [
    { value: 'all', label: 'All Priorities' },
    ...Object.entries(config.priorities)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([id]) => ({ value: id, label: id.charAt(0).toUpperCase() + id.slice(1) })),
  ], [config.priorities]);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const statusMatch = statusFilter === 'all' || task.status === statusFilter;
      const priorityMatch = priorityFilter === 'all' || task.priority === priorityFilter;
      const query = searchQuery.toLowerCase();
      const searchMatch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query);
      return statusMatch && priorityMatch && searchMatch;
    });
  }, [tasks, statusFilter, priorityFilter, searchQuery]);

  return (
    <>
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Ticket className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Tickets
            </h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {loading
              ? 'Loading...'
              : `${filteredTasks.length} of ${tasks.length} tickets displayed`}
          </p>
        </div>

        {/* Filter Bar */}
        <div
          className="rounded-lg border p-4 flex items-end gap-4"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex-1">
            <label
              htmlFor="search"
              className="block text-[10px] font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Search
            </label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                id="search"
                type="text"
                placeholder="Filter by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded border pl-8 pr-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="status-filter"
              className="block text-[10px] font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border px-2 py-1.5 text-xs"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="priority-filter"
              className="block text-[10px] font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded border px-2 py-1.5 text-xs"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tickets List */}
        {loading ? (
          <div
            className="rounded-lg border p-8 text-center"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Loading tickets...
            </p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div
            className="rounded-lg border p-8 text-center"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <Ticket
              className="w-10 h-10 mx-auto mb-3 opacity-40"
              style={{ color: 'var(--text-muted)' }}
            />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              {tasks.length === 0 ? 'No tickets found' : 'No tickets match your filters'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {tasks.length === 0
                ? 'Create your first ticket to get started'
                : 'Try adjusting your filter criteria'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="rounded-lg border p-3 cursor-pointer transition-colors"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  paddingLeft: task.parentTaskId ? '2rem' : undefined,
                  borderLeftColor: task.parentTaskId ? 'var(--accent-violet)' : undefined,
                  borderLeftWidth: task.parentTaskId ? '3px' : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {task.parentTaskId && (
                        <GitBranch size={12} style={{ color: 'var(--accent-violet)' }} />
                      )}
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {task.id.slice(0, 8)}
                      </span>
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {task.title}
                      </span>
                      {task.artifacts && task.artifacts.length > 0 && (
                        <span
                          className="flex items-center gap-0.5 text-[9px] shrink-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          <Paperclip size={9} />
                          {task.artifacts.length}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p
                        className="text-xs line-clamp-1"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {task.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${STATUS_COLORS[task.status]}20`,
                        color: STATUS_COLORS[task.status],
                      }}
                    >
                      {task.status}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        background: `${getPriorityColor(task.priority)}15`,
                        color: getPriorityColor(task.priority),
                      }}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {task.assignedAgent && (
                    <span className="text-[10px]" style={{ color: 'var(--accent-violet)' }}>
                      {task.assignedAgent}
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(task.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
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
