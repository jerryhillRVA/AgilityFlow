'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  const sections = [
    {
      title: 'Model Configuration',
      color: 'var(--accent-violet)',
      items: [
        { label: 'Default Provider', value: 'Anthropic' },
        { label: 'Fast Tier', value: 'claude-haiku-4-5-20251001' },
        { label: 'Balanced Tier', value: 'claude-sonnet-4-5-20250929' },
        { label: 'Advanced Tier', value: 'claude-opus-4-6' },
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
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        System configuration and connection status.
      </p>

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.title} className="p-5 rounded-lg border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', borderLeft: `3px solid ${section.color}` }}>
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
    </div>
  );
}
