import type { TaskStatus } from '@/types/task';

/**
 * Canonical status transition map.
 * Each status maps to an array of valid target statuses.
 * The first element is the "primary forward" transition.
 */
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'pending':     [],                         // subtask-only — agent-managed, no manual transitions
  'backlog':     ['todo'],
  'todo':        ['in-progress', 'backlog'],
  'in-progress': ['review', 'blocked'],
  'review':      ['done', 'in-progress'],
  'done':        [],                         // terminal state
  'blocked':     ['todo', 'in-progress'],
};

/** Valid statuses for subtasks */
export const SUBTASK_STATUSES: TaskStatus[] = ['pending', 'in-progress', 'done', 'blocked'];

/** Column ordering for directional semantics */
export const STATUS_ORDER: TaskStatus[] = [
  'backlog', 'todo', 'in-progress', 'review', 'done',
];

export function getValidTransitions(from: TaskStatus): TaskStatus[] {
  return STATUS_TRANSITIONS[from] || [];
}

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return getValidTransitions(from).includes(to);
}

/** Human-readable labels for transition buttons */
export const TRANSITION_LABELS: Record<string, string> = {
  'backlog->todo':          'Move to To Do',
  'todo->in-progress':      'Start Work',
  'todo->backlog':          'Send to Backlog',
  'in-progress->review':    'Submit for Review',
  'in-progress->blocked':   'Mark Blocked',
  'review->done':           'Mark Done',
  'review->in-progress':    'Request Changes',
  'blocked->todo':          'Unblock → To Do',
  'blocked->in-progress':   'Resume Work',
};

export function getTransitionLabel(from: TaskStatus, to: TaskStatus): string {
  return TRANSITION_LABELS[`${from}->${to}`] || `Move to ${to}`;
}

/** Status display colors — matches SprintBoard column colors */
export const STATUS_COLORS: Record<TaskStatus, string> = {
  'pending':     'var(--accent-cyan)',
  'backlog':     'var(--text-muted)',
  'todo':        'var(--accent-blue)',
  'in-progress': 'var(--accent-amber)',
  'review':      'var(--accent-violet)',
  'done':        'var(--accent-green)',
  'blocked':     'var(--accent-red)',
};
