'use client';

import { useEffect, useState } from 'react';

export function TestingConfigPanel() {
  const [testEnvironmentUrl, setTestEnvironmentUrl] = useState('http://localhost:3000');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const testing = data.settings?.testing;
        if (testing?.testEnvironmentUrl) {
          setTestEnvironmentUrl(testing.testEnvironmentUrl);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testing: { testEnvironmentUrl } }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Save failed');
      }
      setMessage({ text: 'Settings saved', type: 'success' });
    } catch (error) {
      setMessage({ text: String(error), type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-lg border"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', borderLeft: '3px solid var(--accent-green)' }}>

        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--accent-green)' }}>
          Test Execution
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Test Environment URL
            </label>
            <input
              type="text"
              value={testEnvironmentUrl}
              onChange={e => setTestEnvironmentUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full px-3 py-1.5 rounded text-xs font-mono border"
              style={{
                background: 'var(--bg-tertiary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              The base URL where your application is running for test execution.
            </p>
          </div>
        </div>

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
