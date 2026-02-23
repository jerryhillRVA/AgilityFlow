'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { CSSProperties } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const headingBase: CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 600,
  lineHeight: 1.4,
};

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ ...headingBase, fontSize: '1.25rem', marginTop: '1.25rem', marginBottom: '0.75rem', paddingBottom: '0.375rem', borderBottom: '1px solid var(--border)' }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ ...headingBase, fontSize: '1.1rem', marginTop: '1.1rem', marginBottom: '0.5rem', paddingBottom: '0.25rem', borderBottom: '1px solid var(--border)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ ...headingBase, fontSize: '0.95rem', marginTop: '1rem', marginBottom: '0.4rem' }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ ...headingBase, fontSize: '0.85rem', marginTop: '0.75rem', marginBottom: '0.3rem' }}>
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 style={{ ...headingBase, fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 style={{ ...headingBase, fontSize: '0.75rem', marginTop: '0.5rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.7, marginBottom: '0.625rem' }}>
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'var(--text-primary)' }}>{children}</em>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.7, paddingLeft: '1.5rem', marginBottom: '0.625rem', listStyleType: 'disc' }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.7, paddingLeft: '1.5rem', marginBottom: '0.625rem', listStyleType: 'decimal' }}>
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: '0.2rem' }}>{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid var(--accent)',
      paddingLeft: '0.75rem',
      marginLeft: 0,
      marginBottom: '0.625rem',
      fontStyle: 'italic',
      color: 'var(--text-muted)',
    }}>
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code style={{
          display: 'block',
          fontSize: '0.75rem',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {children}
        </code>
      );
    }
    return (
      <code style={{
        background: 'var(--bg-tertiary)',
        color: 'var(--accent-cyan)',
        padding: '0.125rem 0.375rem',
        borderRadius: '3px',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '0.75rem',
      marginBottom: '0.625rem',
      overflowX: 'auto',
      fontSize: '0.75rem',
      lineHeight: 1.6,
    }}>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', marginBottom: '0.625rem' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
      }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ borderBottom: '2px solid var(--border)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th style={{
      textAlign: 'left',
      padding: '0.5rem 0.625rem',
      color: 'var(--text-primary)',
      fontWeight: 600,
      fontSize: '0.7rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '0.4rem 0.625rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </td>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
  ),
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
