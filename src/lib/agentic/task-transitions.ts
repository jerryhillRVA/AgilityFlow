/**
 * Server-side task transition helpers — reads from config/workflow.yaml via workflow-loader.
 *
 * NOTE: This module uses `fs` (via workflow-loader) and is server-only.
 * Client components should use the `useWorkflow()` hook from WorkflowProvider instead.
 */
import {
  getTransitions,
  isValidTransition as wfIsValidTransition,
  getTransitionLabel as wfGetTransitionLabel,
  getSubtaskStatuses,
  getStatusOrder,
  getStatusColor,
  getAllStatusIds,
  getWorkflow,
} from './workflow-loader';

/**
 * Canonical status transition map — loaded from config/workflow.yaml.
 * Each status maps to an array of valid target statuses.
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = (() => {
  const ids = getAllStatusIds();
  const result: Record<string, string[]> = {};
  for (const id of ids) {
    result[id] = getTransitions(id);
  }
  return result;
})();

/** Valid statuses for subtasks — loaded from config/workflow.yaml */
export const SUBTASK_STATUSES: string[] = getSubtaskStatuses();

/** Column ordering for directional semantics — loaded from config/workflow.yaml */
export const STATUS_ORDER: string[] = getStatusOrder();

export function getValidTransitions(from: string): string[] {
  return getTransitions(from);
}

export function isValidTransition(from: string, to: string): boolean {
  return wfIsValidTransition(from, to);
}

/** Human-readable labels for transition buttons — loaded from config/workflow.yaml */
export const TRANSITION_LABELS: Record<string, string> = (() => {
  return { ...getWorkflow().transitionLabels };
})();

export function getTransitionLabel(from: string, to: string): string {
  return wfGetTransitionLabel(from, to);
}

/** Status display colors — loaded from config/workflow.yaml */
export const STATUS_COLORS: Record<string, string> = (() => {
  const ids = getAllStatusIds();
  const result: Record<string, string> = {};
  for (const id of ids) {
    result[id] = getStatusColor(id);
  }
  return result;
})();
