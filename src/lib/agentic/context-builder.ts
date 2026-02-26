import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS } from './fs-paths';
import type { Task, TaskArtifact } from '@/types/task';
import { log } from './logger';
import { getRegistry } from './registry';

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

  // 2. Prior artifacts filtered by role relevance (from agent definition)
  const registry = await getRegistry();
  const agentDef = registry.getAgent(agentId);
  const relevantCategories = agentDef?.contextCategories || ['requirements', 'design', 'verification'];
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
