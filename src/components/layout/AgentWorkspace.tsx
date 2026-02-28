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
    <aside className="w-80 flex-shrink-0 border-l flex flex-col"
      style={{
        borderColor: 'var(--glass-border)',
        background: 'var(--gradient-sidebar)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: '-1px 0 12px rgba(0, 0, 0, 0.3)',
      }}>
      <div className="p-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="text-[10px] font-semibold tracking-widest uppercase mb-2"
          style={{ color: 'var(--accent-amber)' }}>
          Agent Workspace
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3 py-1 rounded text-[10px] font-medium cursor-pointer"
              style={{
                background: activeTab === tab.id ? 'var(--bg-tertiary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all var(--duration-fast) ease',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-3 min-h-0">
        {activeTab === 'activity' && <ActivityFeed />}
        {activeTab === 'proposals' && <ProposalsPanel />}
        {activeTab === 'ask' && <AgentChat />}
      </div>
    </aside>
  );
}
