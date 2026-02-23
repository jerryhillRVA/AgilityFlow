'use client';

import { useEffect, useState } from 'react';
import type { ConnectorStatus } from '@/types/settings';

interface GitHubFormState {
  repoUrl: string;
  branch: string;
  pat: string;
  clonePath: string;
  syncIntervalMinutes: number;
  autoSync: boolean;
}

const STATUS_COLORS: Record<ConnectorStatus, string> = {
  disconnected: 'var(--text-muted)',
  connected: 'var(--accent-green)',
  syncing: 'var(--accent-orange)',
  error: 'var(--accent-red)',
};

export function GitHubConnectorPanel() {
  const [form, setForm] = useState<GitHubFormState>({
    repoUrl: '',
    branch: 'main',
    pat: '',
    clonePath: '.agility/repos',
    syncIntervalMinutes: 15,
    autoSync: false,
  });
  const [patConfigured, setPatConfigured] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<ConnectorStatus>('disconnected');
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [lastError, setLastError] = useState<string | undefined>();
  const [filesIndexed, setFilesIndexed] = useState<number | undefined>();
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const gh = data.settings?.connectors?.github;
        if (gh) {
          setForm({
            repoUrl: gh.repoUrl || '',
            branch: gh.branch || 'main',
            pat: '',
            clonePath: gh.clonePath || '.agility/repos',
            syncIntervalMinutes: gh.syncIntervalMinutes ?? 15,
            autoSync: gh.autoSync ?? false,
          });
          setPatConfigured(gh.patConfigured || false);
        }
        const rt = data.runtime?.github;
        if (rt) {
          setRuntimeStatus(rt.status || 'disconnected');
          setLastSyncAt(rt.lastSyncAt);
          setLastError(rt.lastError);
          setFilesIndexed(rt.filesIndexed);
        }
        setEncryptionAvailable(data.encryption?.available ?? true);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const update: Record<string, unknown> = {
        repoUrl: form.repoUrl,
        branch: form.branch,
        clonePath: form.clonePath,
        syncIntervalMinutes: form.syncIntervalMinutes,
        autoSync: form.autoSync,
      };
      if (form.pat) {
        update.pat = form.pat;
      }
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github: update }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Save failed');
      }
      const data = await res.json();
      setPatConfigured(data.settings?.connectors?.github?.patConfigured || false);
      if (data.runtime?.github) {
        setRuntimeStatus(data.runtime.github.status);
      }
      setForm(prev => ({ ...prev, pat: '' }));
      setMessage({ text: 'Settings saved', type: 'success' });
    } catch (error) {
      setMessage({ text: String(error), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/connectors/github/sync', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Sync failed');
      }
      setMessage({ text: 'Sync started', type: 'success' });
      // Poll status after a short delay
      setTimeout(async () => {
        try {
          const data = await fetch('/api/settings').then(r => r.json());
          const rt = data.runtime?.github;
          if (rt) {
            setRuntimeStatus(rt.status);
            setLastSyncAt(rt.lastSyncAt);
            setLastError(rt.lastError);
            setFilesIndexed(rt.filesIndexed);
          }
        } catch { /* ignore */ }
        setSyncing(false);
      }, 3000);
    } catch (error) {
      setMessage({ text: String(error), type: 'error' });
      setSyncing(false);
    }
  }

  if (!loaded) {
    return (
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* GitHub Connector Card */}
      <div className="p-5 rounded-lg border"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', borderLeft: '3px solid var(--accent)' }}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            GitHub Connector
          </h2>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg-tertiary)', color: STATUS_COLORS[runtimeStatus] }}>
            {runtimeStatus}
          </span>
        </div>

        {!encryptionAvailable && (
          <div className="mb-4 p-3 rounded text-xs"
            style={{ background: 'rgba(255,150,50,0.1)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange)' }}>
            ROOT_SECRET is not configured. Set it in .env.local to enable secret encryption.
          </div>
        )}

        <div className="space-y-4">
          {/* Repository URL */}
          <div>
            <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Repository URL
            </label>
            <input
              type="text"
              value={form.repoUrl}
              onChange={e => setForm(prev => ({ ...prev, repoUrl: e.target.value }))}
              placeholder="https://github.com/owner/repo"
              className="w-full px-3 py-1.5 rounded text-xs font-mono border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Branch */}
          <div>
            <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Branch
            </label>
            <input
              type="text"
              value={form.branch}
              onChange={e => setForm(prev => ({ ...prev, branch: e.target.value }))}
              placeholder="main"
              className="w-full px-3 py-1.5 rounded text-xs font-mono border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* PAT */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Personal Access Token
              </label>
              {patConfigured && (
                <span className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(100,200,100,0.15)', color: 'var(--accent-green)' }}>
                  Configured
                </span>
              )}
            </div>
            <input
              type="password"
              value={form.pat}
              onChange={e => setForm(prev => ({ ...prev, pat: e.target.value }))}
              placeholder={patConfigured ? '(encrypted — enter new value to replace)' : 'ghp_...'}
              className="w-full px-3 py-1.5 rounded text-xs font-mono border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Clone Path */}
          <div>
            <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Clone Path (relative to project root)
            </label>
            <input
              type="text"
              value={form.clonePath}
              onChange={e => setForm(prev => ({ ...prev, clonePath: e.target.value }))}
              className="w-full px-3 py-1.5 rounded text-xs font-mono border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Sync Interval + Auto-sync */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Sync Interval (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={form.syncIntervalMinutes}
                onChange={e => setForm(prev => ({ ...prev, syncIntervalMinutes: parseInt(e.target.value) || 15 }))}
                className="w-full px-3 py-1.5 rounded text-xs font-mono border"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id="autoSync"
                checked={form.autoSync}
                onChange={e => setForm(prev => ({ ...prev, autoSync: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="autoSync" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Auto-sync
              </label>
            </div>
          </div>
        </div>

        {/* Status Info */}
        {(lastSyncAt || lastError || filesIndexed !== undefined) && (
          <div className="mt-4 pt-4 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
            {lastSyncAt && (
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Last sync: {new Date(lastSyncAt).toLocaleString()}
              </div>
            )}
            {filesIndexed !== undefined && (
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Files indexed: {filesIndexed}
              </div>
            )}
            {lastError && (
              <div className="text-[10px]" style={{ color: 'var(--accent-red)' }}>
                Error: {lastError}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !patConfigured || !form.repoUrl}
            className="px-4 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer border"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border)',
              opacity: (syncing || !patConfigured || !form.repoUrl) ? 0.4 : 1,
            }}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className="mt-3 text-xs"
            style={{ color: message.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
