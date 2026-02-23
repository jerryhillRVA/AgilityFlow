'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Play, User, Paperclip, FileText } from 'lucide-react';
import type { Task } from '@/types/task';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--accent-red)',
  high: 'var(--accent-orange)',
  medium: 'var(--accent-amber)',
  low: 'var(--accent-green)',
};

export function ProposalsPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Find parent tasks in "review" status (plan ready for approval)
  const planTasks = tasks.filter(t => t.status === 'review' && !t.parentTaskId);

  // Get subtasks for a parent
  function getSubtasks(parentId: string): Task[] {
    return tasks.filter(t => t.parentTaskId === parentId);
  }

  // Active tasks being executed
  const activeTasks = tasks.filter(t => t.status === 'in-progress');

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllSubtasks(parentId: string) {
    const subtasks = getSubtasks(parentId);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = subtasks.every(t => next.has(t.id));
      for (const t of subtasks) {
        if (allSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  async function handleApprove() {
    if (selectedIds.size === 0 || approving) return;
    setApproving(true);
    setApproveResult(null);

    try {
      const res = await fetch('/api/tasks/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setApproveResult(`${data.approved} task(s) approved and executing`);
        setSelectedIds(new Set());
        fetchTasks();
      } else {
        setApproveResult(`Error: ${data.error}`);
      }
    } catch {
      setApproveResult('Failed to approve tasks');
    } finally {
      setApproving(false);
    }
  }

  if (planTasks.length === 0 && activeTasks.length === 0) {
    return (
      <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
        No proposals yet. Submit a task in Plan mode to see the orchestrator&apos;s plan here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plans awaiting approval */}
      {planTasks.map((parent) => {
        const subtasks = getSubtasks(parent.id);
        const allSelected = subtasks.length > 0 && subtasks.every(t => selectedIds.has(t.id));

        return (
          <div key={parent.id} className="rounded border" style={{ borderColor: 'var(--accent)', background: 'var(--bg-secondary)' }}>
            {/* Plan header */}
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent)' }}>
                  plan ready
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,165,0,0.1)', color: PRIORITY_COLORS[parent.priority] || 'var(--text-muted)' }}>
                  {parent.priority}
                </span>
              </div>
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {parent.title}
              </div>
              <div className="text-[10px] mt-1 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <span>{subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''} planned</span>
                {parent.artifacts && parent.artifacts.length > 0 && (
                  <span className="flex items-center gap-0.5" style={{ color: 'var(--accent)' }}>
                    <Paperclip size={9} />
                    {parent.artifacts.length} artifact{parent.artifacts.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Subtask list */}
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {subtasks.map((sub) => (
                <label key={sub.id}
                  className="flex items-start gap-2 p-2 cursor-pointer hover:bg-black/10 transition-colors"
                  style={{ borderColor: 'var(--border)' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(sub.id)}
                    onChange={() => toggleSelect(sub.id)}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {sub.title}
                    </div>
                    <div className="text-[9px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                      {sub.description}
                    </div>
                    {sub.assignedAgent && (
                      <div className="flex items-center gap-1 mt-1">
                        <User size={9} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[9px]" style={{ color: 'var(--accent)' }}>
                          {sub.assignedAgent}
                        </span>
                      </div>
                    )}
                    {sub.artifacts && sub.artifacts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {sub.artifacts.map((a, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--accent-green)' }}>
                            <FileText size={8} />
                            <span className="truncate">{a.filename}</span>
                            <span style={{ color: 'var(--text-muted)' }}>({a.namespace})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[8px] px-1 py-0.5 rounded shrink-0"
                    style={{ background: 'rgba(255,165,0,0.1)', color: PRIORITY_COLORS[sub.priority] || 'var(--text-muted)' }}>
                    {sub.priority}
                  </span>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="p-2 flex gap-2">
              <button
                onClick={() => selectAllSubtasks(parent.id)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={10} />
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleApprove}
                disabled={selectedIds.size === 0 || approving}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium disabled:opacity-50"
                style={{ background: 'var(--accent-green)', color: 'white' }}>
                <Play size={10} />
                {approving ? 'Approving...' : `Execute (${selectedIds.size})`}
              </button>
            </div>
          </div>
        );
      })}

      {/* Active executions */}
      {activeTasks.length > 0 && (
        <div>
          <div className="text-[10px] font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            Active Executions
          </div>
          {activeTasks.map((task) => (
            <div key={task.id} className="p-2 rounded border mb-2"
              style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent)' }}>
                  in-progress
                </span>
                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {task.title}
                </span>
              </div>
              {task.assignedAgent && (
                <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Agent: {task.assignedAgent}
                </div>
              )}
              {task.artifacts && task.artifacts.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {task.artifacts.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--accent-green)' }}>
                      <FileText size={8} />
                      <span className="truncate">{a.filename}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {approveResult && (
        <div className="text-[10px] p-2 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-green)' }}>
          {approveResult}
        </div>
      )}
    </div>
  );
}
