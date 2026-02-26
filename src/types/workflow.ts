export interface StatusConfig {
  id: string;
  label: string;
  color: string;
  column: boolean;
  order: number;
  terminal?: boolean;
  subtaskOnly?: boolean;
}

export interface TransitionActionFilter {
  status?: string;
  agents?: string[];
}

export interface TransitionAction {
  action: 'run_wave' | 'cascade_done';
  filter?: TransitionActionFilter;
  description: string;
}

export interface PriorityConfig {
  id: string;
  label: string;
  color: string;
  order: number;
}

export interface ArtifactCategoryConfig {
  id: string;
  label: string;
  order: number;
}

export interface SubtaskLifecycle {
  initial: string;
  statuses: string[];
  manualTransitions: boolean;
}

export interface ParentLifecycle {
  initial: string;
  reviewGate: boolean;
}

export interface WorkflowConfig {
  name: string;
  description: string;
  statuses: Record<string, Omit<StatusConfig, 'id'>>;
  transitions: Record<string, string[]>;
  transitionLabels: Record<string, string>;
  transitionActions: Record<string, TransitionAction>;
  subtaskLifecycle: SubtaskLifecycle;
  parentLifecycle: ParentLifecycle;
  priorities: Record<string, Omit<PriorityConfig, 'id' | 'label'>>;
  artifactCategories: Record<string, Omit<ArtifactCategoryConfig, 'id'>>;
}
