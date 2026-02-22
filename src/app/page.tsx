'use client';

import { useEffect, useState } from 'react';
import { Bot, Zap, LayoutDashboard, CheckCircle } from 'lucide-react';
import { TaskSubmitForm } from '@/components/agent/TaskSubmitForm';
import type { AgentDefinition } from '@/types/agent';
import type { Task } from '@/types/task';

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
    fetch('/api/tasks').then(r => r.json()).then(d => setTasks(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  const stats = [
    { label: 'Agents', value: agents.length, icon: Bot, color: 'var(--accent-amber)' },
    { label: 'Active Tasks', value: tasks.filter(t => t.status === 'in-progress').length, icon: Zap, color: 'var(--accent-blue)' },
    { label: 'Total Tasks', value: tasks.length, icon: LayoutDashboard, color: 'var(--accent-violet)' },
    { label: 'Completed', value: tasks.filter(t => t.status === 'done').length, icon: CheckCircle, color: 'var(--accent-green)' },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Agility Flow
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Markdown-driven agentic platform
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-lg border"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} style={{ color }} />
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
            </div>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {health && (
        <div className="mb-8 p-3 rounded-lg border text-xs"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <span style={{ color: 'var(--text-muted)' }}>System: </span>
          <span style={{ color: 'var(--accent-green)' }}>{String(health.status)}</span>
          <span style={{ color: 'var(--text-muted)' }}> | Agentic FS: </span>
          <span style={{ color: (health.agenticFs as Record<string, string>)?.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {String((health.agenticFs as Record<string, string>)?.status || 'unknown')}
          </span>
          <span style={{ color: 'var(--text-muted)' }}> | Adapter: </span>
          <span style={{ color: 'var(--accent-violet)' }}>{String(health.adapter)}</span>
        </div>
      )}

      <div className="p-6 rounded-lg border"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Submit a Task
        </h2>
        <TaskSubmitForm />
      </div>
    </div>
  );
}
