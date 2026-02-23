'use client';

import { useState } from 'react';
import { Send, Brain, Zap } from 'lucide-react';

export function TaskSubmitForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [mode, setMode] = useState<'plan' | 'execute'>('plan');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), priority, mode }),
      });
      const data = await res.json();
      if (res.ok) {
        const modeLabel = mode === 'plan' ? 'Planning' : 'Executing';
        setResult(`${modeLabel}: ${data.id}`);
        setTitle('');
        setDescription('');
        onSubmitted?.();
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult('Failed to submit task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Task Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Build login page"
          className="w-full px-3 py-2 rounded text-xs border outline-none"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>
      <div>
        <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what needs to be done..."
          rows={3}
          className="w-full px-3 py-2 rounded text-xs border outline-none resize-none"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2 rounded text-xs border outline-none"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
            Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'plan' | 'execute')}
            className="w-full px-3 py-2 rounded text-xs border outline-none"
            style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <option value="plan">Plan Only</option>
            <option value="execute">Auto Execute</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading || !title.trim() || !description.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: mode === 'plan' ? 'var(--accent)' : 'var(--accent-orange)', color: 'white' }}>
        {mode === 'plan' ? <Brain size={12} /> : <Zap size={12} />}
        {loading ? 'Submitting...' : mode === 'plan' ? 'Plan Task' : 'Execute Task'}
      </button>
      {mode === 'execute' && (
        <div className="text-[10px] p-1.5 rounded" style={{ background: 'rgba(255,165,0,0.1)', color: 'var(--accent-orange)' }}>
          ⚡ Auto-execute will delegate to agents immediately without review
        </div>
      )}
      {result && (
        <div className="text-[10px] p-2 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-green)' }}>
          {result}
        </div>
      )}
    </form>
  );
}
