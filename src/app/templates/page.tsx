'use client';

import { useEffect, useState } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import type { TemplateDefinition } from '@/types/agent';
import { TemplateDetailPanel } from '@/components/templates/TemplateDetailPanel';

function truncateBody(body: string, maxLength: number): string {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength).trim() + '...';
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/templates');
        if (!response.ok) {
          throw new Error(`Failed to fetch templates: ${response.statusText}`);
        }
        const data = await response.json();
        setTemplates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching templates:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const handleTemplateClick = (template: TemplateDefinition) => {
    setSelectedTemplate(template);
  };

  const handleClosePanel = () => {
    setSelectedTemplate(null);
  };

  if (loading) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Templates</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable output format templates
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3"
              style={{ borderColor: 'var(--accent-violet)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading templates...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Templates</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable output format templates
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center max-w-md">
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent-red)' }} />
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Failed to load templates
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-violet)', color: 'var(--bg-primary)' }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Templates</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable output format templates
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              No templates found
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Templates will appear here once they are defined in the system.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Templates</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          {templates.length} template{templates.length !== 1 ? 's' : ''} loaded from markdown definitions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className="p-5 rounded-lg border cursor-pointer transition-all duration-200"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: selectedTemplate?.id === template.id ? 'var(--accent-violet)' : 'var(--border)',
                borderLeft: '3px solid var(--accent-violet)',
                boxShadow: selectedTemplate?.id === template.id ? '0 4px 12px rgba(0,0,0,0.2)' : undefined,
              }}
              onClick={() => handleTemplateClick(template)}
              role="button"
              tabIndex={0}
              aria-pressed={selectedTemplate?.id === template.id}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTemplateClick(template);
                }
              }}
              aria-label={`View details for ${template.name}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} style={{ color: 'var(--accent-violet)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--accent-violet)' }}>
                  {template.name}
                </h3>
                {template.version && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded ml-auto"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    v{template.version}
                  </span>
                )}
              </div>

              {template.description && (
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {template.description}
                </p>
              )}

              {template.body && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    Preview
                  </div>
                  <p className="text-[10px] leading-relaxed line-clamp-3 font-mono" style={{ color: 'var(--text-muted)' }}>
                    {truncateBody(template.body, 200)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
