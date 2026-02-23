'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import type { TaskArtifact } from '@/types/task';

interface ArtifactViewerModalProps {
  artifact: TaskArtifact;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  requirements: 'var(--accent-blue)',
  implementation: 'var(--accent-amber)',
  verification: 'var(--accent-green)',
  other: 'var(--text-muted)',
};

export function ArtifactViewerModal({ artifact, onClose }: ArtifactViewerModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  useEffect(() => {
    async function fetchContent() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/artifacts/${encodeURIComponent(artifact.fileId)}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setContent(data.content);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchContent();
  }, [artifact.fileId]);

  const categoryColor = CATEGORY_COLORS[artifact.category] || CATEGORY_COLORS.other;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed top-[5%] left-1/2 -translate-x-1/2 z-[70] w-[700px] max-w-[90vw] max-h-[85vh] rounded-lg border overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} style={{ color: categoryColor }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {artifact.filename}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded uppercase"
                  style={{
                    background: `${categoryColor}20`,
                    color: categoryColor,
                  }}
                >
                  {artifact.category}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  {artifact.namespace}/{artifact.path}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>Loading artifact...</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded text-xs" style={{ background: 'var(--accent-red)15', color: 'var(--accent-red)' }}>
              Failed to load artifact: {error}
            </div>
          )}

          {content !== null && !loading && (
            <pre
              className="text-xs leading-relaxed whitespace-pre-wrap font-mono"
              style={{ color: 'var(--text-secondary)' }}
            >
              {content}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
