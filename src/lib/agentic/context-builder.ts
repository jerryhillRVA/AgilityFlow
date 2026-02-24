import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS } from './fs-paths';
import type { Task, TaskArtifact, ArtifactCategory } from '@/types/task';
import { log } from './logger';

/** Maps agent roles to the artifact categories they need as context */
const AGENT_CATEGORY_MAP: Record<string, ArtifactCategory[]> = {
  'technical-writer': ['requirements', 'design', 'verification'],
  'backend-designer': ['requirements', 'design'],
  'frontend-designer': ['requirements', 'design'],
  'qa-analyst': ['requirements', 'design'],
  'design-reviewer': ['design', 'verification'],
};

const MAX_ARTIFACT_CHARS = 2000;
const MAX_RAG_CHARS = 1000;

/**
 * Builds pre-fetched context for ReWOO single-shot agents.
 * No LLM calls — uses Agentic FS for artifact content and RAG.
 */
export async function buildAgentContext(
  task: Task,
  agentId: string,
  priorArtifacts: TaskArtifact[],
): Promise<string> {
  const parts: string[] = [];

  // 1. Task description
  parts.push(`## Task\n${task.title}\n\n${task.description}`);

  // 2. Prior artifacts filtered by role relevance
  const relevantCategories = AGENT_CATEGORY_MAP[agentId] || ['requirements', 'design', 'verification'];
  const relevant = priorArtifacts.filter(a => relevantCategories.includes(a.category));

  if (relevant.length > 0) {
    parts.push('## Prior Artifacts');
    const fs = getAgenticFSClient();

    for (const artifact of relevant) {
      try {
        const content = await fs.downloadFile(artifact.fileId);
        const truncated = content.length > MAX_ARTIFACT_CHARS
          ? content.slice(0, MAX_ARTIFACT_CHARS) + '\n... [truncated]'
          : content;
        parts.push(`### ${artifact.filename} (${artifact.category})\n${truncated}`);
      } catch (err) {
        log.warn('context-builder', `Failed to fetch artifact "${artifact.filename}" (${artifact.fileId})`, { error: String(err) });
        parts.push(`### ${artifact.filename} (${artifact.category})\n[Could not fetch]`);
      }
    }
  }

  // 3. RAG context from Agentic FS (best-effort)
  try {
    const fs = getAgenticFSClient();
    const ragResult = await fs.ask(
      `Context for: ${task.title}. Focus on ${agentId} relevant information.`,
      { k: 3 },
    );
    if (ragResult?.answer) {
      parts.push(`## Related Context\n${ragResult.answer.slice(0, MAX_RAG_CHARS)}`);
    }
  } catch (err) {
    log.debug('context-builder', 'RAG context unavailable', { error: String(err) });
  }

  // 4. Code context from indexed repository (best-effort)
  try {
    const fsClient = getAgenticFSClient();
    const codeResult = await fsClient.ask(
      `Relevant source code for: ${task.title}. Focus on ${agentId} patterns and implementations.`,
      { k: 3, namespace: NS.CODE },
    );
    if (codeResult?.answer) {
      parts.push(`## Codebase Context\n${codeResult.answer.slice(0, MAX_RAG_CHARS)}`);
    }
  } catch (err) {
    log.debug('context-builder', 'Code namespace RAG unavailable', { error: String(err) });
  }

  return parts.join('\n\n');
}
