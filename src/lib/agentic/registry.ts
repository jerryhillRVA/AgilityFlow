import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import type { AgentDefinition, SkillDefinition, CommandDefinition, TemplateDefinition } from '@/types/agent';

interface ParsedFile {
  id: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export class CapabilityRegistry {
  agents: Map<string, AgentDefinition> = new Map();
  skills: Map<string, SkillDefinition> = new Map();
  commands: Map<string, CommandDefinition> = new Map();
  templates: Map<string, TemplateDefinition> = new Map();
  context: Map<string, string> = new Map();

  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), 'definitions');
  }

  async load(): Promise<void> {
    await Promise.all([
      this.loadAgents(),
      this.loadSkills(),
      this.loadCommands(),
      this.loadTemplates(),
      this.loadContext(),
    ]);
  }

  private async loadAgents(): Promise<void> {
    const files = await this.readMarkdownFiles(path.join(this.basePath, 'agents'));
    for (const { id, frontmatter: fm, body } of files) {
      this.agents.set(id, {
        id,
        name: (fm.name as string) || id,
        description: fm.description as string | undefined,
        role: (fm.role as string) || 'agent',
        tier: (fm.tier as AgentDefinition['tier']) || 'balanced',
        model: fm.model as string | undefined,
        skills: (fm.skills as string[]) || [],
        tools: (fm.tools as string[]) || [],
        systemPrompt: body,
        maxIterations: fm.maxIterations as number | undefined,
        constraints: (fm.constraints as string[]) || [],
        delegatesTo: (fm.delegatesTo as string[]) || [],
        memory: fm.memory as AgentDefinition['memory'],
        artifactCategory: fm.artifactCategory as string | undefined,
        contextCategories: (fm.contextCategories as string[]) || undefined,
        iterationBudget: fm.iterationBudget as number | undefined,
        requiresArtifacts: fm.requiresArtifacts as boolean | undefined,
      });
    }
  }

  private async loadSkills(): Promise<void> {
    const files = await this.readMarkdownFiles(path.join(this.basePath, 'skills'));
    for (const { id, frontmatter: fm, body } of files) {
      this.skills.set(id, {
        id,
        name: (fm.name as string) || id,
        description: (fm.description as string) || '',
        body,
        tools: (fm.tools as string[]) || [],
      });
    }
  }

  private async loadCommands(): Promise<void> {
    const files = await this.readMarkdownFiles(path.join(this.basePath, 'commands'));
    for (const { id, frontmatter: fm, body } of files) {
      this.commands.set(id, {
        id,
        name: (fm.name as string) || id,
        description: (fm.description as string) || '',
        version: fm.version as string | undefined,
        skills: (fm.skills as string[]) || [],
        tools: (fm.tools as string[]) || [],
        template: fm.template as string | undefined,
        model_preference: fm.model_preference as string | undefined,
        parameters: fm.parameters as Record<string, { type: string; required: boolean }> | undefined,
        body,
      });
    }
  }

  private async loadTemplates(): Promise<void> {
    const files = await this.readMarkdownFiles(path.join(this.basePath, 'templates'));
    for (const { id, frontmatter: fm, body } of files) {
      this.templates.set(id, {
        id,
        name: (fm.name as string) || id,
        description: fm.description as string | undefined,
        version: fm.version as string | undefined,
        body,
      });
    }
  }

  private async loadContext(): Promise<void> {
    const files = await this.readMarkdownFiles(path.join(this.basePath, 'context'));
    for (const { id, body } of files) {
      this.context.set(id, body);
    }
  }

  private async readMarkdownFiles(dir: string): Promise<ParsedFile[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results: ParsedFile[] = [];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(dir, entry.name);
          const raw = await fs.readFile(filePath, 'utf-8');
          const { data, content } = matter(raw);
          const id = entry.name.replace('.md', '');
          results.push({ id, frontmatter: data, body: content.trim() });
        }
      }
      return results;
    } catch (error) {
      console.error(`[registry] Failed to read markdown from ${dir}:`, String(error));
      return [];
    }
  }

  getAgent(id: string): AgentDefinition | undefined { return this.agents.get(id); }
  getSkill(id: string): SkillDefinition | undefined { return this.skills.get(id); }
  getCommand(id: string): CommandDefinition | undefined { return this.commands.get(id); }
  getTemplate(id: string): TemplateDefinition | undefined { return this.templates.get(id); }
  listAgents(): AgentDefinition[] { return Array.from(this.agents.values()); }
  listSkills(): SkillDefinition[] { return Array.from(this.skills.values()); }
  listCommands(): CommandDefinition[] { return Array.from(this.commands.values()); }
  listTemplates(): TemplateDefinition[] { return Array.from(this.templates.values()); }
}

// Use globalThis to ensure a single instance survives Turbopack module isolation in dev mode
const registryKey = '__agilityflow_registry__' as const;
export async function getRegistry(): Promise<CapabilityRegistry> {
  let registry = (globalThis as Record<string, unknown>)[registryKey] as CapabilityRegistry | undefined;
  if (!registry || registry.agents.size === 0) {
    registry = new CapabilityRegistry();
    await registry.load();
    (globalThis as Record<string, unknown>)[registryKey] = registry;
  }
  return registry;
}
