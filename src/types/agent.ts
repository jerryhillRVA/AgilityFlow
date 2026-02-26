export type ModelTier = 'fast' | 'balanced' | 'advanced';

export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  role: string;
  tier: ModelTier;
  model?: string;
  skills: string[];
  tools: string[];
  systemPrompt: string;
  constraints?: string[];
  maxIterations?: number;
  delegatesTo?: string[];
  memory?: {
    namespace: string;
    path: string;
    auto_load: boolean;
    auto_save: boolean;
  };
  /** Default artifact category for agentic_fs_write — replaces hard-coded AGENT_CATEGORY_MAP */
  artifactCategory?: string;
  /** Which artifact categories this agent receives as pre-fetched context */
  contextCategories?: string[];
  /** Max ReAct iterations for wave execution fallback */
  iterationBudget?: number;
  /** If true, 0 artifacts produced marks the subtask as blocked */
  requiresArtifacts?: boolean;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  body: string;
  tools: string[];
}

export interface CommandDefinition {
  id: string;
  name: string;
  description: string;
  version?: string;
  skills: string[];
  tools: string[];
  template?: string;
  model_preference?: string;
  parameters?: Record<string, { type: string; required: boolean }>;
  body: string;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  body: string;
}
