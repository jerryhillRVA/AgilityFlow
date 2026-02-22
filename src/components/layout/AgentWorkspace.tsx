'use client';

import { useState } from 'react';
import { ActivityFeed } from '@/components/agent/ActivityFeed';
import { AgentChat } from '@/components/agent/AgentChat';
import { ProposalsPanel } from '@/components/agent/ProposalsPanel';

type Tab = 'activity' | 'proposals' | 'ask';

export function AgentWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'proposals', label: 'Proposals' },
    { id: 'ask', label: 'Ask Agent' },
  ];

  return (
    <aside className="w-80 flex-shrink-0 border-l flex flex-col overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[10px] font-semibold tracking-widest uppercase mb-2"
          style={{ color: 'var(--accent-amber)' }}>
          Agent Workspace
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-1 rounded text-[10px] font-medium transition-colors"
              style={{
                background: activeTab === tab.id ? 'var(--bg-tertiary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'activity' && <ActivityFeed />}
        {activeTab === 'proposals' && <ProposalsPanel />}
        {activeTab === 'ask' && <AgentChat />}
      </div>
    </aside>
  );
}
