'use client';

import { useEffect, useState } from 'react';
import { Puzzle, AlertCircle } from 'lucide-react';
import type { SkillDefinition } from '@/types/agent';
import { SkillDetailPanel } from '@/components/skills/SkillDetailPanel';

function truncateBody(body: string, maxLength: number): string {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength).trim() + '...';
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(null);

  useEffect(() => {
    async function fetchSkills() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/skills');
        if (!response.ok) {
          throw new Error(`Failed to fetch skills: ${response.statusText}`);
        }
        const data = await response.json();
        setSkills(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching skills:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSkills();
  }, []);

  const handleSkillClick = (skill: SkillDefinition) => {
    setSelectedSkill(skill);
  };

  const handleClosePanel = () => {
    setSelectedSkill(null);
  };

  if (loading) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Skills</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable expertise blocks
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3"
              style={{ borderColor: 'var(--accent-violet)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading skills...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Skills</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable expertise blocks
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center max-w-md">
            <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent-red)' }} />
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Failed to load skills
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

  if (skills.length === 0) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Skills</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          Reusable expertise blocks
        </p>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <Puzzle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              No skills found
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Skills will appear here once they are defined in the system.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Skills</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
          {skills.length} skill{skills.length !== 1 ? 's' : ''} loaded from markdown definitions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(skill => (
            <div
              key={skill.id}
              className="p-5 rounded-lg border cursor-pointer transition-all duration-200"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: selectedSkill?.id === skill.id ? 'var(--accent-violet)' : 'var(--border)',
                borderLeft: '3px solid var(--accent-violet)',
                boxShadow: selectedSkill?.id === skill.id ? '0 4px 12px rgba(0,0,0,0.2)' : undefined,
              }}
              onClick={() => handleSkillClick(skill)}
              role="button"
              tabIndex={0}
              aria-pressed={selectedSkill?.id === skill.id}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSkillClick(skill);
                }
              }}
              aria-label={`View details for ${skill.name}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Puzzle size={14} style={{ color: 'var(--accent-violet)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--accent-violet)' }}>
                  {skill.name}
                </h3>
              </div>

              {skill.description && (
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {skill.description}
                </p>
              )}

              {skill.tools.length > 0 && (
                <div className="mb-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    Tools
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {skill.tools.map(tool => (
                      <span key={tool} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-cyan)' }}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {skill.body && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    Preview
                  </div>
                  <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: 'var(--text-muted)' }}>
                    {truncateBody(skill.body, 200)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedSkill && (
        <SkillDetailPanel
          skill={selectedSkill}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
