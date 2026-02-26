'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { AgentDefinition, ModelTier } from '@/types/agent';

interface AgentDetailPanelProps {
  agent: AgentDefinition;
  onClose: () => void;
}

const tierColors: Record<ModelTier, string> = {
  fast: 'var(--accent-green)',
  balanced: 'var(--accent-blue)',
  advanced: 'var(--accent-violet)',
};

const tierBadgeClasses: Record<ModelTier, { bg: string; color: string }> = {
  fast: { bg: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' },
  balanced: { bg: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)' },
  advanced: { bg: 'rgba(139,92,246,0.1)', color: 'var(--accent-violet)' },
};

export function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const badge = tierBadgeClasses[agent.tier] ?? { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
        role="presentation"
        aria-label="Close agent detail panel"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] overflow-y-auto border-l"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-detail-title"
      >
        {/* Sticky Header */}
        <div
          className="sticky top-0 z-10 p-4 border-b"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2
                id="agent-detail-title"
                className="text-sm font-semibold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {agent.name}
              </h2>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                {agent.role}
              </p>
              <span
                className="inline-block text-[9px] font-medium px-2 py-0.5 rounded"
                style={{ background: badge.bg, color: badge.color }}
              >
                {agent.tier}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close agent detail panel"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 space-y-5">

          {/* Description */}
          {agent.description && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Description
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {agent.description}
              </p>
            </div>
          )}

          {/* Model & Configuration */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
              Model &amp; Configuration
            </div>
            <div className="space-y-1.5">
              <ConfigRow label="Tier" value={agent.tier} valueColor={tierColors[agent.tier]} />
              {agent.model && <ConfigRow label="Model" value={agent.model} mono />}
              {agent.maxIterations !== undefined && (
                <ConfigRow label="Max Iterations" value={String(agent.maxIterations)} mono />
              )}
              {agent.iterationBudget !== undefined && (
                <ConfigRow label="Iteration Budget" value={String(agent.iterationBudget)} mono />
              )}
            </div>
          </div>

          {/* Skills */}
          {agent.skills.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Skills
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Agent skills">
                {agent.skills.map(skill => (
                  <li key={skill}>
                    <span
                      className="inline-block text-[9px] px-2 py-0.5 rounded"
                      style={{ background: 'rgba(78,205,196,0.1)', color: 'var(--accent-cyan)' }}
                    >
                      {skill}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tools */}
          {agent.tools.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Tools
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Agent tools">
                {agent.tools.map(tool => (
                  <li key={tool}>
                    <span
                      className="inline-block text-[9px] font-mono px-2 py-0.5 rounded"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-cyan)' }}
                    >
                      {tool}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Delegates To */}
          {agent.delegatesTo && agent.delegatesTo.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Delegates To
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Delegate targets">
                {agent.delegatesTo.map(id => (
                  <li key={id}>
                    <span
                      className="inline-block text-[9px] px-2 py-0.5 rounded"
                      style={{ background: 'rgba(244,114,182,0.1)', color: 'var(--accent-rose)' }}
                    >
                      {id}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* System Prompt */}
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
              System Prompt
            </div>
            <pre
              className="font-mono text-[10px] p-3 rounded overflow-y-auto whitespace-pre-wrap border"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border)',
                maxHeight: '300px',
              }}
              aria-label="Agent system prompt, scrollable"
            >
              {agent.systemPrompt}
            </pre>
          </div>

          {/* Constraints */}
          {agent.constraints && agent.constraints.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Constraints
              </div>
              <ul className="space-y-1.5" aria-label="Agent constraints">
                {agent.constraints.map((constraint, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span
                      className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--text-muted)' }}
                      aria-hidden="true"
                    />
                    {constraint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Memory */}
          {agent.memory && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Memory
              </div>
              <div className="space-y-1.5">
                <ConfigRow label="Namespace" value={agent.memory.namespace} mono />
                {agent.memory.path && <ConfigRow label="Path" value={agent.memory.path} mono />}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

function ConfigRow({ label, value, mono, valueColor }: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span
        className={mono ? 'font-mono text-[10px]' : ''}
        style={{ color: valueColor ?? 'var(--text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}
