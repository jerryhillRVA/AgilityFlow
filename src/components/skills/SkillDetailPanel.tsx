'use client';

import { useEffect, useCallback } from 'react';
import { X, Puzzle } from 'lucide-react';
import type { SkillDefinition } from '@/types/agent';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface SkillDetailPanelProps {
  skill: SkillDefinition;
  onClose: () => void;
}

export function SkillDetailPanel({ skill, onClose }: SkillDetailPanelProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 animate-backdrop-fade"
        style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        role="presentation"
        aria-label="Close skill detail panel"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] overflow-y-auto border-l animate-panel-slide-in elevation-3"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--glass-border)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-detail-title"
      >
        {/* Sticky Header */}
        <div
          className="sticky top-0 z-10 p-4 border-b"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Puzzle size={14} style={{ color: 'var(--accent-violet)' }} aria-hidden="true" />
              <h2
                id="skill-detail-title"
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {skill.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close skill details"
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
          {skill.description && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Description
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {skill.description}
              </p>
            </div>
          )}

          {/* Tools */}
          {skill.tools.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Tools
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label="Skill tools">
                {skill.tools.map(tool => (
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

          {/* Implementation / Body */}
          {skill.body ? (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Implementation
              </div>
              <div
                className="p-3 rounded overflow-y-auto border"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border)',
                  maxHeight: '400px',
                }}
                role="region"
                aria-label="Skill implementation body, scrollable"
                tabIndex={0}
              >
                <MarkdownRenderer content={skill.body} className="text-xs" />
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Implementation
              </div>
              <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                No implementation content available
              </p>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
