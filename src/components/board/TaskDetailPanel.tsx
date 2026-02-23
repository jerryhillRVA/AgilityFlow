'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, User, Clock, Tag, FileText, GitBranch, ArrowUpRight, ChevronDown, ChevronRight, Activity, AlertTriangle, Zap } from 'lucide-react';
import type { Task, TaskStatus, TaskArtifact, ArtifactCategory, IterationRecord } from '@/types/task';
import { STATUS_COLORS } from '@/lib/agentic/task-transitions';
import { StatusTransitionButtons } from './StatusTransitionButtons';
import { ArtifactViewerModal } from './ArtifactViewerModal';

interface TaskDetailPanelProps {
  task: Task;
  allTasks: Task[];
  onClose: () => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onSelectTask: (task: Task) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--accent-red)',
  high: 'var(--accent-orange)',
  medium: 'var(--accent-amber)',
  low: 'var(--accent-green)',
};

const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  requirements: 'Requirements',
  implementation: 'Implementation',
  verification: 'Verification',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  requirements: 'var(--accent-blue)',
  implementation: 'var(--accent-amber)',
  verification: 'var(--accent-green)',
  other: 'var(--text-muted)',
};

const CATEGORY_ORDER: ArtifactCategory[] = ['requirements', 'implementation', 'verification', 'other'];

export function TaskDetailPanel({ task, allTasks, onClose, onStatusChange, onSelectTask }: TaskDetailPanelProps) {
  const [viewingArtifact, setViewingArtifact] = useState<TaskArtifact | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (viewingArtifact) {
        setViewingArtifact(null);
      } else {
        onClose();
      }
    }
  }, [onClose, viewingArtifact]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const parentTask = task.parentTaskId ? allTasks.find(t => t.id === task.parentTaskId) : null;
  const subtasks = allTasks.filter(t => t.parentTaskId === task.id);
  const artifacts = task.artifacts || [];

  // Group artifacts by category
  const groupedArtifacts: Record<ArtifactCategory, TaskArtifact[]> = {
    requirements: [],
    implementation: [],
    verification: [],
    other: [],
  };
  for (const artifact of artifacts) {
    const cat = artifact.category || 'other';
    groupedArtifacts[cat].push(artifact);
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] overflow-y-auto border-l"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 p-4 border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{
                    background: `${STATUS_COLORS[task.status]}20`,
                    color: STATUS_COLORS[task.status],
                  }}
                >
                  {task.status}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{
                    background: `${PRIORITY_COLORS[task.priority]}15`,
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  {task.priority}
                </span>
                {task.executionMode && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {task.executionMode}
                  </span>
                )}
              </div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {task.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Stage Transition Controls — only for parent tasks */}
          {!task.parentTaskId && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Move Task
              </div>
              <StatusTransitionButtons task={task} onStatusChange={onStatusChange} subtasks={subtasks} />
            </div>
          )}

          {/* Description */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
              Description
            </div>
            <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {task.description || 'No description'}
            </div>
          </div>

          {/* Details Grid */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
              Details
            </div>
            <div className="space-y-2">
              <DetailRow icon={<Tag size={12} />} label="ID" value={task.id} mono />
              {task.assignedAgent && (
                <DetailRow icon={<User size={12} />} label="Agent" value={task.assignedAgent} accent />
              )}
              <DetailRow icon={<Clock size={12} />} label="Created" value={new Date(task.createdAt).toLocaleString()} />
              <DetailRow icon={<Clock size={12} />} label="Updated" value={new Date(task.updatedAt).toLocaleString()} />
            </div>
          </div>

          {/* Execution Usage — for subtasks with usage data */}
          {task.usage && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Execution Usage
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <UsageStat label="Iterations" value={String(task.usage.iterations)} icon={<Activity size={10} />} />
                <UsageStat label="Input Tokens" value={formatTokens(task.usage.totalInputTokens)} icon={<Zap size={10} />} />
                <UsageStat label="Output Tokens" value={formatTokens(task.usage.totalOutputTokens)} icon={<Zap size={10} />} />
              </div>
              {task.usage.iterationDetails && task.usage.iterationDetails.length > 0 && (
                <IterationBreakdown details={task.usage.iterationDetails} />
              )}
            </div>
          )}

          {/* Agent Result */}
          {task.result && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Agent Result
              </div>
              <div className="text-[11px] leading-relaxed whitespace-pre-wrap p-2 rounded" style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
              }}>
                {task.result}
              </div>
            </div>
          )}

          {/* Error */}
          {task.errorMessage && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--accent-red)' }}>
                <AlertTriangle size={10} />
                Error
              </div>
              <div className="text-[11px] leading-relaxed whitespace-pre-wrap p-2 rounded" style={{
                background: 'rgba(248, 113, 113, 0.1)',
                color: 'var(--accent-red)',
              }}>
                {task.errorMessage}
              </div>
            </div>
          )}

          {/* Parent Task */}
          {parentTask && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Parent Task
              </div>
              <button
                onClick={() => onSelectTask(parentTask)}
                className="w-full text-left p-2 rounded border transition-colors"
                style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <ArrowUpRight size={12} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {parentTask.title}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${STATUS_COLORS[parentTask.status]}20`, color: STATUS_COLORS[parentTask.status] }}>
                    {parentTask.status}
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Subtasks ({subtasks.length})
              </div>
              <div className="space-y-1.5">
                {subtasks.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => onSelectTask(sub)}
                    className="w-full text-left p-2 rounded border transition-colors"
                    style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch size={10} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[11px] font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {sub.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${STATUS_COLORS[sub.status]}20`, color: STATUS_COLORS[sub.status] }}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-5">
                      {sub.assignedAgent && (
                        <span className="text-[9px]" style={{ color: 'var(--accent-violet)' }}>
                          {sub.assignedAgent}
                        </span>
                      )}
                      {sub.usage && (
                        <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {sub.usage.iterations}it / {formatTokens(sub.usage.totalInputTokens + sub.usage.totalOutputTokens)} tok
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Artifacts — grouped by category */}
          {artifacts.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Artifacts ({artifacts.length})
              </div>
              <div className="space-y-3">
                {CATEGORY_ORDER.map(cat => {
                  const items = groupedArtifacts[cat];
                  if (items.length === 0) return null;
                  const isCollapsed = collapsedCategories.has(cat);
                  const catColor = CATEGORY_COLORS[cat];

                  return (
                    <div key={cat}>
                      <button
                        onClick={() => toggleCategory(cat)}
                        className="flex items-center gap-1.5 mb-1 w-full text-left"
                      >
                        {isCollapsed ? (
                          <ChevronRight size={10} style={{ color: catColor }} />
                        ) : (
                          <ChevronDown size={10} style={{ color: catColor }} />
                        )}
                        <span className="text-[10px] font-semibold uppercase" style={{ color: catColor }}>
                          {CATEGORY_LABELS[cat]} ({items.length})
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-1 ml-3">
                          {items.map((artifact, idx) => (
                            <button
                              key={`${cat}-${idx}`}
                              onClick={() => setViewingArtifact(artifact)}
                              className="w-full text-left flex items-center gap-2 p-2 rounded transition-colors cursor-pointer"
                              style={{ background: 'var(--bg-tertiary)' }}
                            >
                              <FileText size={12} style={{ color: catColor }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                  {artifact.filename}
                                </div>
                                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                  {artifact.namespace}/{artifact.path}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plan Summary */}
          {task.planSummary && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Plan Summary
              </div>
              <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                {task.planSummary}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Artifact Viewer Modal */}
      {viewingArtifact && (
        <ArtifactViewerModal
          artifact={viewingArtifact}
          onClose={() => setViewingArtifact(null)}
        />
      )}
    </>
  );
}

function DetailRow({ icon, label, value, mono, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span
        className={`truncate ${mono ? 'font-mono text-[10px]' : ''}`}
        style={{ color: accent ? 'var(--accent-violet)' : 'var(--text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}K`;
  return String(count);
}

function UsageStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="p-2 rounded text-center" style={{ background: 'var(--bg-tertiary)' }}>
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color: 'var(--text-muted)' }}>
        {icon}
        <span className="text-[8px] uppercase">{label}</span>
      </div>
      <div className="text-[12px] font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function IterationBreakdown({ details }: { details: IterationRecord[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[9px] font-medium transition-colors"
        style={{ color: 'var(--accent)' }}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Per-iteration breakdown
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {details.map((iter) => (
            <div key={iter.iteration} className="flex items-center gap-2 text-[9px] px-2 py-1 rounded"
              style={{ background: 'var(--bg-primary)' }}>
              <span className="font-mono w-6 shrink-0" style={{ color: 'var(--text-muted)' }}>
                #{iter.iteration}
              </span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                {formatTokens(iter.inputTokenDelta)}in / {formatTokens(iter.outputTokenDelta)}out
              </span>
              {iter.toolCalls.length > 0 && (
                <span className="truncate" style={{ color: 'var(--accent-orange)' }}>
                  {iter.toolCalls.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
