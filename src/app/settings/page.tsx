'use client';

import { useEffect, useState } from 'react';
import { GitHubConnectorPanel } from '@/components/settings/GitHubConnectorPanel';
import { TestingConfigPanel } from '@/components/settings/TestingConfigPanel';

type SettingsTab = 'system' | 'connectors' | 'testing';

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all var(--duration-fast) ease',
      }}
    >
      {children}
    </button>
  );
}

function SystemTab({ health }: { health: Record<string, unknown> | null }) {
  const sections = [
    {
      title: 'Model Configuration',
      color: 'var(--accent-violet)',
      items: [
        { label: 'Active Adapter', value: health ? String(health.adapter) : 'Checking...' },
        { label: 'Fast Tier', value: 'config/models.yaml' },
        { label: 'Balanced Tier', value: 'config/models.yaml' },
        { label: 'Advanced Tier', value: 'config/models.yaml' },
      ],
    },
    {
      title: 'Agentic Filesystem',
      color: 'var(--accent-orange)',
      items: [
        { label: 'URL', value: process.env.NEXT_PUBLIC_AGENTIC_FS_URL || 'http://localhost:8000' },
        { label: 'Tenant', value: 'default' },
        { label: 'Status', value: health ? String((health.agenticFs as Record<string, string>)?.status || 'unknown') : 'Checking...' },
      ],
    },
    {
      title: 'System',
      color: 'var(--accent-cyan)',
      items: [
        { label: 'App', value: 'Agility Flow' },
        { label: 'Adapter', value: health ? String(health.adapter) : 'Checking...' },
        { label: 'Status', value: health ? String(health.status) : 'Checking...' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section.title} className="p-5 rounded-lg card-elevated animate-fade-in-up"
          style={{ borderLeft: `3px solid ${section.color}` }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: section.color }}>
            {section.title}
          </h2>
          <div className="space-y-2">
            {section.items.map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span className="font-mono px-2 py-0.5 rounded"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('system');
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        System configuration and connection status.
      </p>

      <div className="flex gap-4 mb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton active={activeTab === 'system'} onClick={() => setActiveTab('system')}>
          System
        </TabButton>
        <TabButton active={activeTab === 'connectors'} onClick={() => setActiveTab('connectors')}>
          Connectors
        </TabButton>
        <TabButton active={activeTab === 'testing'} onClick={() => setActiveTab('testing')}>
          Testing
        </TabButton>
      </div>

      {activeTab === 'system' && <SystemTab health={health} />}
      {activeTab === 'connectors' && <GitHubConnectorPanel />}
      {activeTab === 'testing' && <TestingConfigPanel />}
    </div>
  );
}
