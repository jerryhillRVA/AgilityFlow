import type { ToolSchema } from './adapters/model-adapter';
import type { Task } from '@/types/task';
import type { CapabilityRegistry } from './registry';
import { getToolSchemas } from './tools/builtin-tools';

export interface AssembledPrompt {
  systemPrompt: string;
  userMessage: string;
  tools: ToolSchema[];
  maxIterations?: number;
}

export class PromptAssembler {
  constructor(private registry: CapabilityRegistry) {}

  assemble(agentId: string, task: Task, additionalContext?: string): AssembledPrompt {
    const agent = this.registry.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    // 1. Build system prompt from agent definition
    const systemParts: string[] = [agent.systemPrompt];

    // 2. Append skill instructions
    for (const skillId of agent.skills) {
      const skill = this.registry.getSkill(skillId);
      if (skill) {
        systemParts.push(`\n## Skill: ${skill.name}\n${skill.body}`);
      }
    }

    // 3. Append project context
    for (const [, contextBody] of this.registry.context) {
      systemParts.push(`\n---\n${contextBody}`);
    }

    // 4. Append completion instruction (prevents agents from looping)
    systemParts.push(`\n---\n## Completion\nOnce you have finished your task and written all required artifacts, respond with a brief text summary of what you accomplished. Do NOT call any more tools after your work is complete. Do NOT rewrite or revise artifacts you have already written — write each artifact exactly once.`);

    // 5. Build user message from task
    let userMessage = `## Task: ${task.title}\n\n${task.description}`;
    if (task.priority) userMessage += `\n\nPriority: ${task.priority}`;
    if (additionalContext) userMessage += `\n\n## Additional Context\n\n${additionalContext}`;

    // 6. Resolve tool schemas
    const tools = getToolSchemas(agent.tools);

    return { systemPrompt: systemParts.join('\n'), userMessage, tools, maxIterations: agent.maxIterations };
  }
}
