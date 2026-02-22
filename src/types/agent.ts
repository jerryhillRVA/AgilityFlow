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
  delegatesTo?: string[];
  memory?: {
    namespace: string;
    path: string;
    auto_load: boolean;
    auto_save: boolean;
  };
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
