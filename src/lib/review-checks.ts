import type { Task, TaskArtifact } from '@/types/task';
import type {
  ReviewCheckItem,
  ReviewCheckStatus,
  ReviewCheckSummary,
  ReviewOverallConclusion,
  TicketReviewChecksResponse,
} from '@/types/review-checks';

interface BuildReviewChecksOptions {
  ticketId?: string;
  includeHistory?: boolean;
  includeLogs?: boolean;
  now?: Date;
}

interface ParsedReportCheck {
  name: string;
  status: ReviewCheckStatus;
  summary?: string;
}

const STALE_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;

export function buildReviewChecksResponse(
  task: Task,
  options: BuildReviewChecksOptions = {},
): TicketReviewChecksResponse {
  const now = options.now ?? new Date();
  const includeHistory = options.includeHistory === true;
  const includeLogs = options.includeLogs === true;
  const generatedAt = now.toISOString();
  const verificationArtifacts = (task.artifacts || []).filter(a => a.category === 'verification');
  const parsedReportChecks = task.testReport ? parseChecksFromReport(task.testReport) : [];

  const checks = parsedReportChecks.length > 0
    ? buildChecksFromReport(task, parsedReportChecks, includeHistory, includeLogs, now)
    : buildChecksFromArtifacts(task, verificationArtifacts, includeHistory, includeLogs, now);

  const configured = verificationArtifacts.length > 0 || parsedReportChecks.length > 0;
  const summary = summarizeChecks(checks);
  const overallConclusion = deriveOverallConclusion(summary);
  const staleBaseline = summary.lastUpdatedAt ?? task.testUpdatedAt ?? task.updatedAt;
  const staleAt = Date.parse(staleBaseline);
  const isStale = Number.isFinite(staleAt)
    ? summary.inProgress > 0 && (now.getTime() - staleAt) > STALE_RUNNING_THRESHOLD_MS
    : false;

  return {
    ticketId: options.ticketId ?? task.id,
    ticketStatus: task.status,
    checks,
    summary,
    configured,
    generatedAt,
    overallConclusion,
    isStale,
  };
}

function buildChecksFromArtifacts(
  task: Task,
  artifacts: TaskArtifact[],
  includeHistory: boolean,
  includeLogs: boolean,
  now: Date,
): ReviewCheckItem[] {
  if (artifacts.length === 0) return [];
  const status = mapTaskTestStatus(task.testStatus, task);
  const updatedAt = task.testUpdatedAt ?? task.updatedAt;
  const durationMs = getDurationMs(task.testStartedAt, task.testCompletedAt, now);
  const summary = buildTaskSummary(task);
  const resultUrl = buildResultUrl(task, includeLogs);

  return artifacts
    .slice()
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map((artifact, index) => ({
      id: `${task.id}-${slugify(artifact.filename)}-${index + 1}`,
      key: toCheckKey(artifact.filename, index),
      name: toCheckName(artifact.filename),
      type: 'automated',
      required: true,
      status,
      createdAt: task.createdAt,
      queuedAt: task.testQueuedAt,
      startedAt: task.testStartedAt,
      completedAt: task.testCompletedAt,
      updatedAt,
      progressPercent: status === 'running' ? task.testPassedCount !== undefined && task.testFailedCount !== undefined
        ? Math.min(99, Math.max(0, Math.round((task.testPassedCount / Math.max(1, task.testPassedCount + task.testFailedCount)) * 100)))
        : undefined
        : undefined,
      durationMs,
      resultUrl,
      summary,
      errorMessage: status === 'failed' ? task.testError : undefined,
      conclusion: mapStatusToConclusion(status),
      history: includeHistory ? buildHistory(task, status) : undefined,
    }));
}

function buildChecksFromReport(
  task: Task,
  parsedChecks: ParsedReportCheck[],
  includeHistory: boolean,
  includeLogs: boolean,
  now: Date,
): ReviewCheckItem[] {
  const updatedAt = task.testUpdatedAt ?? task.updatedAt;
  const resultUrl = buildResultUrl(task, includeLogs);

  return parsedChecks.map((parsed, index) => {
    const durationMs = getDurationMs(task.testStartedAt, task.testCompletedAt, now);
    return {
      id: `${task.id}-${slugify(parsed.name)}-${index + 1}`,
      key: toCheckKey(parsed.name, index),
      name: parsed.name,
      type: 'automated',
      required: true,
      status: parsed.status,
      createdAt: task.createdAt,
      queuedAt: task.testQueuedAt,
      startedAt: task.testStartedAt,
      completedAt: task.testCompletedAt,
      updatedAt,
      durationMs,
      resultUrl,
      summary: parsed.summary,
      errorMessage: parsed.status === 'failed' ? task.testError : undefined,
      conclusion: mapStatusToConclusion(parsed.status),
      history: includeHistory ? buildHistory(task, parsed.status) : undefined,
    };
  });
}

function mapTaskTestStatus(testStatus: Task['testStatus'], task: Task): ReviewCheckStatus {
  switch (testStatus) {
    case 'testing':
      return 'running';
    case 'passed':
      return 'passed';
    case 'failed': {
      if ((task.testPassedCount ?? 0) > 0 && (task.testFailedCount ?? 0) > 0) {
        return 'partial';
      }
      return 'failed';
    }
    default:
      return 'not_started';
  }
}

function parseChecksFromReport(report: string): ParsedReportCheck[] {
  const checks: ParsedReportCheck[] = [];
  const sectionMatch = report.match(/##\s+Test Results([\s\S]*?)(?:\n##\s+[^\n]+|$)/i);
  const source = sectionMatch ? sectionMatch[1] : report;
  const seen = new Set<string>();

  const blockRegex = /###\s+(.+?)\n([\s\S]*?)(?=\n###\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(source)) !== null) {
    const name = match[1]?.trim();
    const body = match[2] ?? '';
    if (!name) continue;
    const statusMatch = body.match(/\*\*Status:\*\*\s*([A-Za-z _-]+)/i);
    const status = statusMatch ? parseStatus(statusMatch[1]) : undefined;
    if (!status) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    checks.push({
      name,
      status,
      summary: extractResultSummary(body),
    });
  }

  if (checks.length > 0) return checks;

  const fallbackRegex = /^-\s+[✅❌]\s+(.+)$/gm;
  while ((match = fallbackRegex.exec(source)) !== null) {
    const line = match[1]?.trim();
    if (!line) continue;
    const status = /\bFAIL\b/i.test(line) ? 'failed' : /\bPASS\b/i.test(line) ? 'passed' : undefined;
    if (!status) continue;
    const name = line
      .replace(/\bPASS\b/ig, '')
      .replace(/\bFAIL\b/ig, '')
      .trim()
      .replace(/[-:]+$/, '')
      .trim();
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    checks.push({ name, status });
  }

  return checks;
}

function parseStatus(rawStatus: string): ReviewCheckStatus | undefined {
  const normalized = rawStatus.trim().toLowerCase().replace(/\s+/g, '_');
  switch (normalized) {
    case 'pass':
    case 'passed':
    case 'success':
      return 'passed';
    case 'fail':
    case 'failed':
    case 'failure':
      return 'failed';
    case 'partial':
    case 'mixed':
      return 'partial';
    case 'blocked':
    case 'action_required':
      return 'blocked';
    case 'skipped':
    case 'skip':
      return 'skipped';
    case 'queued':
      return 'queued';
    case 'running':
    case 'in_progress':
      return 'running';
    case 'not_started':
      return 'not_started';
    default:
      return undefined;
  }
}

function extractResultSummary(block: string): string | undefined {
  const resultMatch = block.match(/\*\*Result:\*\*\s*(.+)/i);
  if (resultMatch?.[1]) return resultMatch[1].trim();
  const notesMatch = block.match(/\*\*Notes:\*\*\s*(.+)/i);
  if (notesMatch?.[1]) return notesMatch[1].trim();
  return undefined;
}

function summarizeChecks(checks: ReviewCheckItem[]): ReviewCheckSummary {
  const summary: ReviewCheckSummary = {
    total: checks.length,
    notStarted: 0,
    queued: 0,
    running: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    partial: 0,
    inProgress: 0,
    completed: 0,
    passRate: undefined,
    lastUpdatedAt: undefined,
  };

  let latestUpdatedAt = 0;
  for (const check of checks) {
    switch (check.status) {
      case 'not_started':
        summary.notStarted += 1;
        break;
      case 'queued':
        summary.queued += 1;
        break;
      case 'running':
        summary.running += 1;
        break;
      case 'passed':
        summary.passed += 1;
        break;
      case 'failed':
        summary.failed += 1;
        break;
      case 'blocked':
        summary.blocked += 1;
        break;
      case 'skipped':
        summary.skipped += 1;
        break;
      case 'partial':
        summary.partial += 1;
        break;
    }

    const updatedAt = Date.parse(check.updatedAt);
    if (Number.isFinite(updatedAt) && updatedAt > latestUpdatedAt) {
      latestUpdatedAt = updatedAt;
      summary.lastUpdatedAt = check.updatedAt;
    }
  }

  summary.inProgress = summary.queued + summary.running;
  summary.completed = summary.passed + summary.failed + summary.blocked + summary.skipped + summary.partial;
  if (summary.completed > 0) {
    summary.passRate = summary.passed / summary.completed;
  }
  return summary;
}

function deriveOverallConclusion(summary: ReviewCheckSummary): ReviewOverallConclusion {
  if (summary.total === 0 || summary.notStarted === summary.total) return 'not_started';
  if (summary.inProgress > 0) return 'in_progress';
  if (summary.failed > 0) return 'failed';
  if (summary.blocked > 0) return 'blocked';
  if (summary.partial > 0) return 'partial';
  if (summary.passed > 0 && summary.completed === summary.total) return 'passed';
  return 'not_started';
}

function buildTaskSummary(task: Task): string | undefined {
  if (task.testStatus === 'testing') return 'Review checks are running.';
  if (task.testStatus === 'passed') return 'Review checks passed.';
  if (task.testStatus === 'failed') {
    if ((task.testPassedCount ?? 0) > 0 && (task.testFailedCount ?? 0) > 0) {
      return 'Review checks completed with mixed results.';
    }
    return task.testError || 'Review checks failed.';
  }
  return undefined;
}

function buildHistory(task: Task, status: ReviewCheckStatus) {
  const history: { status: ReviewCheckStatus; at: string; reason?: string }[] = [];
  if (task.testQueuedAt) {
    history.push({ status: 'queued', at: task.testQueuedAt, reason: 'Review check queued' });
  }
  if (task.testStartedAt) {
    history.push({ status: 'running', at: task.testStartedAt, reason: 'Review check started' });
  }
  if (status === 'not_started' && task.createdAt) {
    history.push({ status: 'not_started', at: task.createdAt });
  }
  if (task.testCompletedAt && status !== 'running' && status !== 'queued' && status !== 'not_started') {
    history.push({ status, at: task.testCompletedAt });
  }
  if (history.length === 0) {
    const at = task.testUpdatedAt ?? task.updatedAt;
    history.push({ status, at });
  }
  return history;
}

function getDurationMs(startedAt?: string, completedAt?: string, now?: Date): number | undefined {
  if (!startedAt) return undefined;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return undefined;
  if (completedAt) {
    const completed = Date.parse(completedAt);
    if (Number.isFinite(completed) && completed >= start) {
      return completed - start;
    }
  }
  if (!now) return undefined;
  return Math.max(0, now.getTime() - start);
}

function buildResultUrl(task: Task, includeLogs: boolean): string | undefined {
  if (!includeLogs) return undefined;
  if (!task.testReport) return undefined;
  return `/api/tasks/${task.id}/test-report`;
}

function mapStatusToConclusion(status: ReviewCheckStatus) {
  switch (status) {
    case 'passed':
      return 'success' as const;
    case 'failed':
      return 'failure' as const;
    case 'partial':
      return 'partial' as const;
    case 'blocked':
      return 'action_required' as const;
    case 'skipped':
      return 'neutral' as const;
    case 'queued':
    case 'running':
    case 'not_started':
      return undefined;
  }
}

function toCheckName(raw: string): string {
  const withoutExtension = raw.replace(/\.[^/.]+$/, '');
  return withoutExtension
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCheckKey(raw: string, index: number): string {
  const slug = slugify(raw);
  return slug ? slug.slice(0, 64) : `check-${index + 1}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
