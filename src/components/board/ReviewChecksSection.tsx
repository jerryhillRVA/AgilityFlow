'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  PauseCircle,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { TaskStatus } from '@/types/task';
import type { ReviewCheckItem, ReviewCheckStatus, TicketReviewChecksResponse } from '@/types/review-checks';

interface ReviewChecksSectionProps {
  taskId: string;
  taskStatus: TaskStatus;
}

const RUNNING_POLL_INTERVAL_MS = 5000;
const IDLE_POLL_INTERVAL_MS = 15000;

export function ReviewChecksSection({ taskId, taskStatus }: ReviewChecksSectionProps) {
  const [data, setData] = useState<TicketReviewChecksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const lastSnapshotRef = useRef<Map<string, string>>(new Map());
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadReviewChecks = useCallback(async (initialLoad = false) => {
    if (taskStatus !== 'review') return;
    if (initialLoad) {
      setLoading(true);
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}/review-checks?includeLogs=true`, {
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error((payload && typeof payload.error === 'string' && payload.error) || `HTTP ${response.status}`);
      }

      const next = payload as TicketReviewChecksResponse;
      const previous = lastSnapshotRef.current;
      const changedIds = next.checks
        .filter(check => previous.get(check.id) !== `${check.status}:${check.updatedAt}`)
        .map(check => check.id);

      if (changedIds.length > 0) {
        setHighlightedIds(new Set(changedIds));
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => setHighlightedIds(new Set()), 1500);
      }

      lastSnapshotRef.current = new Map(next.checks.map(check => [check.id, `${check.status}:${check.updatedAt}`]));
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [taskId, taskStatus]);

  useEffect(() => {
    if (taskStatus !== 'review') {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    void loadReviewChecks(true);
  }, [loadReviewChecks, taskStatus]);

  const pollIntervalMs = useMemo(
    () => (data?.summary.inProgress ?? 0) > 0 ? RUNNING_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
    [data?.summary.inProgress],
  );

  useEffect(() => {
    if (taskStatus !== 'review') return;
    const interval = setInterval(() => {
      void loadReviewChecks(false);
    }, pollIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [taskStatus, pollIntervalMs, loadReviewChecks]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  if (taskStatus !== 'review') {
    return null;
  }

  return (
    <section
      aria-labelledby="review-checks-heading"
      className="rounded-lg border p-4 md:p-5 space-y-4"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="review-checks-heading" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Review Checks
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Check status and outcomes for this review ticket.
          </p>
        </div>
        <button
          onClick={() => void loadReviewChecks(false)}
          className="px-2 py-1 text-[10px] rounded border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
        >
          Refresh
        </button>
      </div>

      {data && (
        <ReviewCheckSummaryHeader
          summary={data.summary}
          lastUpdatedAt={data.summary.lastUpdatedAt ?? data.generatedAt}
          isStale={data.isStale}
        />
      )}

      {loading && !data && <ReviewChecksLoadingState />}

      {error && (
        <div
          className="rounded-md border p-3 text-[11px] space-y-2"
          style={{ borderColor: 'rgba(248, 113, 113, 0.5)', background: 'rgba(248, 113, 113, 0.08)', color: 'var(--accent-red)' }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => void loadReviewChecks(true)}
            className="text-[10px] px-2 py-1 rounded border transition-colors"
            style={{ borderColor: 'rgba(248, 113, 113, 0.45)', color: 'var(--accent-red)' }}
          >
            Retry
          </button>
        </div>
      )}

      {data && !loading && data.configured === false && data.checks.length === 0 && (
        <ReviewChecksEmptyState />
      )}

      {data && data.checks.length > 0 && (
        <ul className="space-y-2">
          {data.checks.map(check => (
            <li key={check.id}>
              <ReviewCheckRow
                check={check}
                highlighted={highlightedIds.has(check.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewChecksLoadingState() {
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-2 text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={12} className="animate-spin" />
        <span>Loading review checks…</span>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-12 rounded animate-pulse"
            style={{ background: 'var(--bg-primary)' }}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewChecksEmptyState() {
  return (
    <div
      className="rounded-md border p-3 text-[11px] space-y-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    >
      <p style={{ color: 'var(--text-secondary)' }}>No review checks configured for this ticket.</p>
      <a
        href="/settings"
        className="inline-flex items-center gap-1 text-[10px] font-medium underline"
        style={{ color: 'var(--accent)' }}
      >
        Open testing settings
      </a>
    </div>
  );
}

function ReviewCheckSummaryHeader({
  summary,
  lastUpdatedAt,
  isStale,
}: {
  summary: TicketReviewChecksResponse['summary'];
  lastUpdatedAt: string;
  isStale: boolean;
}) {
  const liveSummary = `${summary.inProgress} running, ${summary.passed} passed, ${summary.failed} failed, ${summary.partial} partial`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <SummaryChip label={`${summary.total} total`} />
        <SummaryChip label={`${summary.inProgress} in progress`} tone="info" />
        <SummaryChip label={`${summary.passed} passed`} tone="success" />
        <SummaryChip label={`${summary.failed} failed`} tone="danger" />
        {summary.partial > 0 && <SummaryChip label={`${summary.partial} partial`} tone="warning" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <span aria-live="polite">{liveSummary}</span>
        <span>Last updated {formatRelativeTime(lastUpdatedAt)}</span>
        {isStale && (
          <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-orange)' }}>
            <ShieldAlert size={10} />
            Updates may be stale
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'danger' | 'info' | 'warning' }) {
  const style = getSummaryChipStyle(tone);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium"
      style={style}
    >
      {label}
    </span>
  );
}

function ReviewCheckRow({ check, highlighted }: { check: ReviewCheckItem; highlighted: boolean }) {
  const statusConfig = getStatusConfig(check.status);
  const StatusIcon = statusConfig.icon;
  const updatedLabel = `Updated ${formatRelativeTime(check.updatedAt)}`;

  return (
    <div
      className="rounded-md border p-3 transition-colors motion-reduce:transition-none md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3"
      style={{
        borderColor: 'var(--border)',
        background: highlighted ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-secondary)',
      }}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {check.name}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
            style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}
          >
            Check
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>Type: {check.type}</span>
          {check.required && <span>Required</span>}
          <span>{updatedLabel}</span>
          <span>{new Date(check.updatedAt).toLocaleString()}</span>
        </div>

        {typeof check.progressPercent === 'number' && check.status === 'running' && (
          <div className="space-y-1">
            <div
              className="h-1.5 rounded overflow-hidden"
              style={{ background: 'var(--bg-primary)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={check.progressPercent}
              aria-label={`${check.name} progress`}
            >
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(0, Math.min(100, check.progressPercent))}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {check.progressPercent}% complete
            </p>
          </div>
        )}

        {check.summary && (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {check.summary}
          </p>
        )}

        {check.errorMessage && (
          <p className="text-[11px]" style={{ color: 'var(--accent-red)' }}>
            {check.errorMessage}
          </p>
        )}
      </div>

      <div className="mt-2 md:mt-0 flex items-center gap-2 md:flex-col md:items-end md:gap-1">
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-medium"
          style={statusConfig.badgeStyle}
        >
          <StatusIcon size={10} className={check.status === 'running' || check.status === 'queued' ? 'animate-spin' : ''} />
          {statusConfig.label}
        </span>
        {check.resultUrl && (
          <a
            href={check.resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
            style={{ color: 'var(--accent)' }}
          >
            View results
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

function getSummaryChipStyle(tone: 'neutral' | 'success' | 'danger' | 'info' | 'warning') {
  switch (tone) {
    case 'success':
      return { background: 'rgba(34, 197, 94, 0.14)', color: 'var(--accent-green)' };
    case 'danger':
      return { background: 'rgba(248, 113, 113, 0.14)', color: 'var(--accent-red)' };
    case 'info':
      return { background: 'rgba(99, 102, 241, 0.14)', color: 'var(--accent)' };
    case 'warning':
      return { background: 'rgba(251, 146, 60, 0.14)', color: 'var(--accent-orange)' };
    default:
      return { background: 'var(--bg-primary)', color: 'var(--text-secondary)' };
  }
}

function getStatusConfig(status: ReviewCheckStatus) {
  switch (status) {
    case 'queued':
      return {
        label: 'Queued',
        icon: Clock3,
        badgeStyle: { background: 'rgba(99, 102, 241, 0.14)', color: 'var(--accent)' },
      };
    case 'running':
      return {
        label: 'Running',
        icon: Loader2,
        badgeStyle: { background: 'rgba(99, 102, 241, 0.14)', color: 'var(--accent)' },
      };
    case 'passed':
      return {
        label: 'Passed',
        icon: CheckCircle2,
        badgeStyle: { background: 'rgba(34, 197, 94, 0.14)', color: 'var(--accent-green)' },
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: XCircle,
        badgeStyle: { background: 'rgba(248, 113, 113, 0.14)', color: 'var(--accent-red)' },
      };
    case 'partial':
      return {
        label: 'Partial',
        icon: AlertTriangle,
        badgeStyle: { background: 'rgba(251, 146, 60, 0.14)', color: 'var(--accent-orange)' },
      };
    case 'blocked':
      return {
        label: 'Blocked',
        icon: ShieldAlert,
        badgeStyle: { background: 'rgba(251, 146, 60, 0.14)', color: 'var(--accent-orange)' },
      };
    case 'skipped':
      return {
        label: 'Skipped',
        icon: PauseCircle,
        badgeStyle: { background: 'var(--bg-primary)', color: 'var(--text-muted)' },
      };
    case 'not_started':
    default:
      return {
        label: 'Not Started',
        icon: Clock3,
        badgeStyle: { background: 'var(--bg-primary)', color: 'var(--text-muted)' },
      };
  }
}

function formatRelativeTime(isoTimestamp: string): string {
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp)) return 'just now';

  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.floor(Math.abs(diffMs) / 1000);
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
