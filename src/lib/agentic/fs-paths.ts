import type { TaskStatus } from '@/types/task';

// ── Namespace Constants ──
// Single source of truth for all Agentic FS namespace names.
// See docs/data-model.md for the full directory tree reference.

export const NS = {
  TASKS: 'tasks',
  SPRINTS: 'sprints',
  EVENTS: 'events',
  ARTIFACTS: 'artifacts',
  MEMORY: 'memory',
  KNOWLEDGE: 'knowledge',
} as const;

export type Namespace = (typeof NS)[keyof typeof NS];

export const ALL_NAMESPACES: Namespace[] = Object.values(NS);

// ── Registry Tenant ──
// The _registry tenant stores org/portfolio/project hierarchy metadata.

export const REGISTRY_TENANT = '_registry';

// ── Path Builders ──
// All Agentic FS path construction must use these builders.
// Never construct path strings directly outside this file.

export const paths = {
  tasks: {
    dir: (status: TaskStatus): string => status,
    file: (status: TaskStatus, taskId: string): string => `${status}/${taskId}.json`,
  },

  sprints: {
    dir: (sprintId: string): string => sprintId,
    meta: (sprintId: string): string => `${sprintId}/sprint-meta.json`,
    tasks: (sprintId: string): string => `${sprintId}/tasks`,
    taskFile: (sprintId: string, taskId: string): string => `${sprintId}/tasks/${taskId}.json`,
    proposals: (sprintId: string): string => `${sprintId}/proposals`,
  },

  events: {
    dir: (date: string): string => date,
    file: (date: string, eventId: string): string => `${date}/${eventId}.json`,
  },

  artifacts: {
    /** Task-scoped artifact directory: artifacts/{taskId} */
    taskDir: (taskId: string): string => taskId,
    /** Task-scoped artifact category directory: artifacts/{taskId}/{category} */
    taskCategoryDir: (taskId: string, category: string): string => `${taskId}/${category}`,
    /** Task-scoped artifact file: artifacts/{taskId}/{category}/{filename} */
    file: (taskId: string, category: string, filename: string): string => `${taskId}/${category}/${filename}`,
  },

  memory: {
    agentDir: (agentName: string): string => `agents/${agentName}`,
    agentFile: (agentName: string, filename: string): string => `agents/${agentName}/${filename}`,
  },

  knowledge: {
    dir: (category: string): string => category,
    file: (category: string, filename: string): string => `${category}/${filename}`,
  },

  registry: {
    org: (orgId: string): string => `orgs/${orgId}.json`,
    portfolio: (portfolioId: string): string => `portfolios/${portfolioId}.json`,
    project: (projectId: string): string => `projects/${projectId}.json`,
  },
};

// ── Base Directories ──
// Directories created by initializeProject() for a new project tenant.

export const PROJECT_BASE_DIRS: { namespace: Namespace; path: string }[] = [
  // Task status directories
  { namespace: NS.TASKS, path: 'pending' },
  { namespace: NS.TASKS, path: 'backlog' },
  { namespace: NS.TASKS, path: 'todo' },
  { namespace: NS.TASKS, path: 'in-progress' },
  { namespace: NS.TASKS, path: 'review' },
  { namespace: NS.TASKS, path: 'done' },
  { namespace: NS.TASKS, path: 'blocked' },

  // Artifact directories are created on-demand per task (artifacts/{taskId}/{category}/)

  // Agent memory root
  { namespace: NS.MEMORY, path: 'agents' },

  // Knowledge categories
  { namespace: NS.KNOWLEDGE, path: 'architecture' },
  { namespace: NS.KNOWLEDGE, path: 'conventions' },
  { namespace: NS.KNOWLEDGE, path: 'charter' },
  { namespace: NS.KNOWLEDGE, path: 'tech-stack' },
];

// Directories created by initializeRegistry() for the _registry tenant.
export const REGISTRY_BASE_DIRS: { namespace: Namespace; path: string }[] = [
  { namespace: NS.KNOWLEDGE, path: 'orgs' },
  { namespace: NS.KNOWLEDGE, path: 'portfolios' },
  { namespace: NS.KNOWLEDGE, path: 'projects' },
];
