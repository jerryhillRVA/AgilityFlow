'use client';

import { useEffect, useState } from 'react';
import type { AgentDefinition } from '@/types/agent';
import { AgentDetailPanel } from '@/components/agents/AgentDetailPanel';

const tierColors: Record<string, string> = {
  fast: 'var(--accent-green)',
  balanced: 'var(--accent-blue)',
  advanced: 'var(--accent-violet)',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
  }, []);

  const handleCardClick = (agent: AgentDefinition) => {
    setSelectedAgent(agent);
  };

  const handleClosePanel = () => {
    setSelectedAgent(null);
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Agents</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        {agents.length} agents loaded from markdown definitions.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {agents.map((agent, index) => (
          <div
            key={agent.id}
            className="p-5 rounded-lg cursor-pointer card-elevated animate-fade-in-up"
            style={{
              animationDelay: `${index * 75}ms`,
              borderColor: selectedAgent?.id === agent.id ? (tierColors[agent.tier] || 'var(--border)') : undefined,
              borderLeft: `3px solid ${tierColors[agent.tier] || 'var(--border)'}`,
              boxShadow: selectedAgent?.id === agent.id ? `var(--shadow-lg)` : undefined,
            }}
            onClick={() => handleCardClick(agent)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick(agent);
              }
            }}
            aria-label={`View details for ${agent.name}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: tierColors[agent.tier] || 'var(--text-primary)' }}>
                {agent.name}
              </h3>
              <span className="text-[9px] font-medium px-2 py-0.5 rounded"
                style={{ background: `${tierColors[agent.tier]}20`, color: tierColors[agent.tier] }}>
                {agent.tier}
              </span>
            </div>
            {agent.description && (
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{agent.description}</p>
            )}
            <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
              Role: <span style={{ color: 'var(--text-secondary)' }}>{agent.role}</span>
            </div>
            {agent.skills.length > 0 && (
              <div className="mb-2">
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Skills</div>
                <div className="flex flex-wrap gap-1">
                  {agent.skills.map(skill => (
                    <span key={skill} className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(78,205,196,0.1)', color: 'var(--accent-cyan)' }}>{skill}</span>
                  ))}
                </div>
              </div>
            )}
            {agent.tools.length > 0 && (
              <div className="mb-2">
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Tools</div>
                <div className="flex flex-wrap gap-1">
                  {agent.tools.map(tool => (
                    <span key={tool} className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-cyan)' }}>{tool}</span>
                  ))}
                </div>
              </div>
            )}
            {agent.delegatesTo && agent.delegatesTo.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Delegates To</div>
                <div className="flex flex-wrap gap-1">
                  {agent.delegatesTo.map(id => (
                    <span key={id} className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(244,114,182,0.1)', color: 'var(--accent-rose)' }}>{id}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
