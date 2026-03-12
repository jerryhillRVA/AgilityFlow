export type ReviewCheckStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'partial';

export type ReviewCheckType = 'automated' | 'manual' | 'external';

export type ReviewCheckConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'partial';

export interface ReviewCheckHistoryEntry {
  status: ReviewCheckStatus;
  at: string;
  reason?: string;
}

export interface ReviewCheckItem {
  id: string;
  key: string;
  name: string;
  type: ReviewCheckType;
  status: ReviewCheckStatus;
  required: boolean;
  createdAt?: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  progressPercent?: number;
  durationMs?: number;
  resultUrl?: string;
  summary?: string;
  errorMessage?: string;
  conclusion?: ReviewCheckConclusion;
  history?: ReviewCheckHistoryEntry[];
}

export interface ReviewCheckSummary {
  total: number;
  notStarted: number;
  queued: number;
  running: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  partial: number;
  inProgress: number;
  completed: number;
  passRate?: number;
  lastUpdatedAt?: string;
}

export type ReviewOverallConclusion =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'partial'
  | 'blocked';

export interface TicketReviewChecksResponse {
  ticketId: string;
  ticketStatus: string;
  checks: ReviewCheckItem[];
  summary: ReviewCheckSummary;
  configured: boolean;
  generatedAt: string;
  overallConclusion: ReviewOverallConclusion;
  isStale: boolean;
}
