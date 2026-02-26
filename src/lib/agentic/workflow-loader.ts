import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import type {
  WorkflowConfig,
  StatusConfig,
  TransitionAction,
  PriorityConfig,
  ArtifactCategoryConfig,
} from '@/types/workflow';

let cached: WorkflowConfig | null = null;

function loadWorkflow(): WorkflowConfig {
  if (cached) return cached;
  const configPath = path.join(process.cwd(), 'config', 'workflow.yaml');
  const raw = parseYaml(fs.readFileSync(configPath, 'utf8')) as WorkflowConfig;
  cached = raw;
  return raw;
}

export function getWorkflow(): WorkflowConfig {
  return loadWorkflow();
}

/** Returns all statuses sorted by order */
export function getStatuses(): StatusConfig[] {
  const wf = loadWorkflow();
  return Object.entries(wf.statuses)
    .map(([id, cfg]) => ({ id, ...cfg }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/** Returns status IDs that appear as board columns, sorted by order */
export function getBoardColumns(): StatusConfig[] {
  return getStatuses().filter(s => s.column);
}

/** Returns all valid status IDs */
export function getAllStatusIds(): string[] {
  return Object.keys(loadWorkflow().statuses);
}

/** Returns valid transition targets from a given status */
export function getTransitions(from: string): string[] {
  return loadWorkflow().transitions[from] || [];
}

/** Returns whether a transition is valid */
export function isValidTransition(from: string, to: string): boolean {
  return getTransitions(from).includes(to);
}

/** Returns button label for a transition */
export function getTransitionLabel(from: string, to: string): string {
  return loadWorkflow().transitionLabels[`${from}->${to}`] || `Move to ${to}`;
}

/** Returns CSS color for a status */
export function getStatusColor(status: string): string {
  return loadWorkflow().statuses[status]?.color || 'var(--text-muted)';
}

/** Returns the status label */
export function getStatusLabel(status: string): string {
  return loadWorkflow().statuses[status]?.label || status;
}

/** Returns the transition action for a given transition, or undefined */
export function getTransitionAction(from: string, to: string): TransitionAction | undefined {
  return loadWorkflow().transitionActions[`${from}->${to}`];
}

/** Returns statuses valid for subtasks */
export function getSubtaskStatuses(): string[] {
  return loadWorkflow().subtaskLifecycle.statuses;
}

/** Returns the initial status for subtasks */
export function getSubtaskInitialStatus(): string {
  return loadWorkflow().subtaskLifecycle.initial;
}

/** Returns the initial status for parent tasks */
export function getParentInitialStatus(): string {
  return loadWorkflow().parentLifecycle.initial;
}

/** Returns whether subtask manual transitions are allowed */
export function subtaskManualTransitionsAllowed(): boolean {
  return loadWorkflow().subtaskLifecycle.manualTransitions;
}

/** Returns whether the review gate is enabled (all subtasks done before parent→review) */
export function isReviewGateEnabled(): boolean {
  return loadWorkflow().parentLifecycle.reviewGate;
}

/** Returns whether a status is terminal (no outgoing transitions) */
export function isTerminalStatus(status: string): boolean {
  return loadWorkflow().statuses[status]?.terminal === true;
}

/** Returns column-ordered status IDs (for directional semantics) */
export function getStatusOrder(): string[] {
  return getBoardColumns().map(s => s.id);
}

/** Returns all priorities sorted by order */
export function getPriorities(): PriorityConfig[] {
  const wf = loadWorkflow();
  return Object.entries(wf.priorities)
    .map(([id, cfg]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), ...cfg }))
    .sort((a, b) => a.order - b.order);
}

/** Returns CSS color for a priority */
export function getPriorityColor(priority: string): string {
  return loadWorkflow().priorities[priority]?.color || 'var(--text-muted)';
}

/** Returns all valid priority IDs */
export function getAllPriorityIds(): string[] {
  return Object.keys(loadWorkflow().priorities);
}

/** Returns all artifact categories sorted by order */
export function getArtifactCategories(): ArtifactCategoryConfig[] {
  const wf = loadWorkflow();
  return Object.entries(wf.artifactCategories)
    .map(([id, cfg]) => ({ id, ...cfg }))
    .sort((a, b) => a.order - b.order);
}

/** Returns all valid artifact category IDs */
export function getAllArtifactCategoryIds(): string[] {
  return Object.keys(loadWorkflow().artifactCategories);
}

/** Returns the label for an artifact category */
export function getArtifactCategoryLabel(category: string): string {
  return loadWorkflow().artifactCategories[category]?.label || category;
}
