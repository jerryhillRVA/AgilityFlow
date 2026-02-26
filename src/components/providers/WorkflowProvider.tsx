'use client';

import { createContext, useContext, useMemo } from 'react';
import type { WorkflowConfig } from '@/types/workflow';

interface WorkflowHelpers {
  config: WorkflowConfig;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getValidTransitions: (from: string) => string[];
  getTransitionLabel: (from: string, to: string) => string;
  getPriorityColor: (priority: string) => string;
  getArtifactCategoryLabel: (category: string) => string;
  getArtifactCategories: () => { id: string; label: string; order: number }[];
  getBoardColumns: () => { id: string; label: string; color: string; order: number }[];
  STATUS_COLORS: Record<string, string>;
}

const WorkflowContext = createContext<WorkflowHelpers | null>(null);

export function WorkflowProvider({
  config,
  children,
}: {
  config: WorkflowConfig;
  children: React.ReactNode;
}) {
  const helpers = useMemo<WorkflowHelpers>(() => {
    const getStatusColor = (status: string) =>
      config.statuses[status]?.color || 'var(--text-muted)';

    const getStatusLabel = (status: string) =>
      config.statuses[status]?.label || status;

    const getValidTransitions = (from: string): string[] =>
      config.transitions[from] || [];

    const getTransitionLabel = (from: string, to: string): string =>
      config.transitionLabels[`${from}->${to}`] || `Move to ${to}`;

    const getPriorityColor = (priority: string) =>
      config.priorities[priority]?.color || 'var(--text-muted)';

    const getArtifactCategoryLabel = (category: string) =>
      config.artifactCategories[category]?.label || category;

    const getArtifactCategories = () =>
      Object.entries(config.artifactCategories)
        .map(([id, cfg]) => ({ id, ...cfg }))
        .sort((a, b) => a.order - b.order);

    const getBoardColumns = () =>
      Object.entries(config.statuses)
        .filter(([, cfg]) => cfg.column)
        .map(([id, cfg]) => ({ id, label: cfg.label, color: cfg.color, order: cfg.order }))
        .sort((a, b) => a.order - b.order);

    // Build STATUS_COLORS record for backward compat
    const STATUS_COLORS: Record<string, string> = {};
    for (const [id, cfg] of Object.entries(config.statuses)) {
      STATUS_COLORS[id] = cfg.color;
    }

    return {
      config,
      getStatusColor,
      getStatusLabel,
      getValidTransitions,
      getTransitionLabel,
      getPriorityColor,
      getArtifactCategoryLabel,
      getArtifactCategories,
      getBoardColumns,
      STATUS_COLORS,
    };
  }, [config]);

  return (
    <WorkflowContext.Provider value={helpers}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow(): WorkflowHelpers {
  const ctx = useContext(WorkflowContext);
  if (!ctx) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return ctx;
}
