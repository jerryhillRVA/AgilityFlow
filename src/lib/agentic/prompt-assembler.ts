import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import type { ToolSchema } from './adapters/model-adapter';
import type { Task } from '@/types/task';
import type { CapabilityRegistry } from './registry';
import type { AgentDefinition } from '@/types/agent';
import { getToolSchemas } from './tools/builtin-tools';
import { log } from './logger';

export interface AssembledPrompt {
  systemPrompt: string;
  userMessage: string;
  tools: ToolSchema[];
  maxIterations?: number;
  /** Resolved model ID from agent tier + models.yaml */
  model?: string;
}

const REWOO_OUTPUT_FORMAT = `---
## Output Format

Produce your artifacts as structured output. For each artifact:

1. Start with a line: <<<ARTIFACT filename="your-filename.md" category="requirements|design|implementation|verification|other">>>
2. Write the complete artifact content
3. End with a line: <<<END_ARTIFACT>>>

You do NOT have access to tools — all relevant context has been pre-fetched and provided above.
Write ALL required artifacts in a single response.

After all artifacts, write a brief summary of what you produced.`;

export class PromptAssembler {
  private modelConfig: Record<string, Record<string, string>> | null = null;

  constructor(private registry: CapabilityRegistry) {}

  /** Lazily loads config/models.yaml tier-to-model mapping */
  private getModelConfig(): Record<string, Record<string, string>> {
    if (!this.modelConfig) {
      try {
        const configPath = path.join(process.cwd(), 'config', 'models.yaml');
        const raw = parseYaml(fs.readFileSync(configPath, 'utf8'));
        this.modelConfig = raw.tiers;
      } catch {
        // Fallback: hardcoded defaults if config file is missing
        this.modelConfig = {
          fast: { anthropic: 'claude-haiku-4-5-20251001' },
          balanced: { anthropic: 'claude-sonnet-4-5-20250929' },
          advanced: { anthropic: 'claude-opus-4-6' },
        };
      }
    }
    return this.modelConfig!;
  }

  /** Resolves an agent's tier (or explicit model override) to a concrete model ID */
  private resolveModel(agent: AgentDefinition): string | undefined {
    if (agent.model) {
      // Strip provider prefix: "anthropic/claude-opus-4-6" → "claude-opus-4-6"
      const resolved = agent.model.includes('/') ? agent.model.split('/').pop()! : agent.model;
      log.debug('prompt-assembler', `resolveModel: explicit model for ${agent.id}`, { model: resolved });
      return resolved;
    }
    const tiers = this.getModelConfig();
    const resolved = tiers[agent.tier]?.['anthropic'];
    log.debug('prompt-assembler', `resolveModel: tier "${agent.tier}" → ${resolved}`, { agentId: agent.id, tier: agent.tier, model: resolved });
    return resolved;
  }

  /** Builds common system prompt parts (agent def + skills + context) */
  private buildSystemParts(agent: AgentDefinition): string[] {
    const parts: string[] = [agent.systemPrompt];

    for (const skillId of agent.skills) {
      const skill = this.registry.getSkill(skillId);
      if (skill) {
        parts.push(`\n## Skill: ${skill.name}\n${skill.body}`);
      }
    }

    for (const [, contextBody] of this.registry.context) {
      parts.push(`\n---\n${contextBody}`);
    }

    return parts;
  }

  /**
   * Assembles a standard ReAct prompt (with tools, iterative execution).
   * Used for the existing multi-turn agent loop.
   */
  assemble(agentId: string, task: Task, additionalContext?: string): AssembledPrompt {
    const agent = this.registry.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const systemParts = this.buildSystemParts(agent);

    // Completion instruction (prevents agents from looping)
    systemParts.push(`\n---\n## Completion\nOnce you have finished your task and written all required artifacts, respond with a brief text summary of what you accomplished. Do NOT call any more tools after your work is complete. Do NOT rewrite or revise artifacts you have already written — write each artifact exactly once.`);

    let userMessage = `## Task: ${task.title}\n\n${task.description}`;
    if (task.priority) userMessage += `\n\nPriority: ${task.priority}`;
    if (additionalContext) userMessage += `\n\n## Additional Context\n\n${additionalContext}`;

    const tools = getToolSchemas(agent.tools);

    const model = this.resolveModel(agent);
    log.debug('prompt-assembler', `Assembled ReAct prompt for ${agentId}`, { agentId, skillCount: agent.skills.length, toolCount: tools.length, model, systemPromptLength: systemParts.join('\n').length });

    return {
      systemPrompt: systemParts.join('\n'),
      userMessage,
      tools,
      maxIterations: agent.maxIterations,
      model,
    };
  }

  /**
   * Assembles a ReWOO single-shot prompt (no tools, artifact delimiters in system prompt).
   * Used for wave execution — agents produce artifacts in a single response.
   */
  assembleReWOO(agentId: string, task: Task, context: string): AssembledPrompt {
    const agent = this.registry.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const systemParts = this.buildSystemParts(agent);

    // ReWOO output format replaces the tool-based completion instruction
    systemParts.push(REWOO_OUTPUT_FORMAT);

    const userMessage = [
      `## Task: ${task.title}\n\n${task.description}`,
      task.priority ? `\nPriority: ${task.priority}` : '',
      `\n\n## Pre-Fetched Context\n\n${context}`,
    ].join('');

    const model = this.resolveModel(agent);
    log.debug('prompt-assembler', `Assembled ReWOO prompt for ${agentId}`, { agentId, model, contextLength: context.length, systemPromptLength: systemParts.join('\n').length });

    return {
      systemPrompt: systemParts.join('\n'),
      userMessage,
      tools: [], // No tools for ReWOO — all context is pre-fetched
      model,
    };
  }
}
