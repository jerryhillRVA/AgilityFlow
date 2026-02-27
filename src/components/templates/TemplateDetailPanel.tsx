'use client';

import { useEffect, useCallback } from 'react';
import { X, FileText } from 'lucide-react';
import type { TemplateDefinition } from '@/types/agent';

interface TemplateDetailPanelProps {
  template: TemplateDefinition;
  onClose: () => void;
}

export function TemplateDetailPanel({ template, onClose }: TemplateDetailPanelProps) {
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
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
        role="presentation"
        aria-label="Close template detail panel"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] overflow-y-auto border-l"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-detail-title"
      >
        {/* Sticky Header */}
        <div
          className="sticky top-0 z-10 p-4 border-b"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText size={14} style={{ color: 'var(--accent-violet)' }} aria-hidden="true" />
              <h2
                id="template-detail-title"
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {template.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close template details"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {template.version && (
            <p className="text-[10px] mt-1 ml-6" style={{ color: 'var(--text-muted)' }}>
              v{template.version}
            </p>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="p-4 space-y-5">

          {/* Description */}
          {template.description && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Description
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {template.description}
              </p>
            </div>
          )}

          {/* Body */}
          {template.body && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                Template Body
              </div>
              <pre
                className="font-mono text-[10px] p-3 rounded overflow-y-auto whitespace-pre-wrap border"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border)',
                  maxHeight: '400px',
                }}
                aria-label="Template body content, scrollable"
              >
                {template.body}
              </pre>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
