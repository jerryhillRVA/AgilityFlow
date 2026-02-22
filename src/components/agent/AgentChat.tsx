'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export function AgentChat() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'agent', content: data.answer || data.error || 'No response' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'agent', content: 'Failed to reach the agent.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-3 mb-3 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            Ask anything about the project. Powered by RAG.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="text-xs p-2 rounded"
            style={{
              background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
              borderLeft: msg.role === 'agent' ? '2px solid var(--accent-violet)' : 'none',
            }}>
            <div className="text-[9px] font-medium mb-1"
              style={{ color: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--accent-violet)' }}>
              {msg.role === 'user' ? 'You' : 'Agent'}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="text-xs p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
            <span className="animate-pulse" style={{ color: 'var(--accent-violet)' }}>Thinking...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the agent..."
          className="flex-1 px-3 py-2 rounded text-xs border outline-none"
          style={{
            background: 'var(--bg-tertiary)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        />
        <button type="submit" disabled={loading}
          className="p-2 rounded transition-colors"
          style={{ background: 'var(--accent)', color: 'white' }}>
          <Send size={12} />
        </button>
      </form>
    </div>
  );
}
