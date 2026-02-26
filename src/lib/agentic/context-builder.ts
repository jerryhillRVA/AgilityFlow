import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS } from './fs-paths';
import type { Task, TaskArtifact } from '@/types/task';
import { log, startTimer } from './logger';
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
  const totalElapsed = startTimer();
  log.debug('context-builder', `Building context for ${agentId}`, { taskId: task.id, priorArtifactCount: priorArtifacts.length });
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
      const artifactElapsed = startTimer();
      try {
        const content = await fs.downloadFile(artifact.fileId);
        const wasTruncated = content.length > MAX_ARTIFACT_CHARS;
        const truncated = wasTruncated
          ? content.slice(0, MAX_ARTIFACT_CHARS) + '\n... [truncated]'
          : content;
        log.debug('context-builder', `Fetched artifact "${artifact.filename}"`, { fileId: artifact.fileId, originalLength: content.length, wasTruncated, elapsedMs: artifactElapsed() });
        parts.push(`### ${artifact.filename} (${artifact.category})\n${truncated}`);
      } catch (err) {
        log.warn('context-builder', `Failed to fetch artifact "${artifact.filename}" (${artifact.fileId})`, { error: String(err), elapsedMs: artifactElapsed() });
        parts.push(`### ${artifact.filename} (${artifact.category})\n[Could not fetch]`);
      }
    }
  }

  // 3. RAG context from Agentic FS (best-effort)
  try {
    const ragElapsed = startTimer();
    const fs = getAgenticFSClient();
    const ragResult = await fs.ask(
      `Context for: ${task.title}. Focus on ${agentId} relevant information.`,
      { k: 3 },
    );
    if (ragResult?.answer) {
      log.debug('context-builder', `RAG context fetched`, { answerLength: ragResult.answer.length, elapsedMs: ragElapsed() });
      parts.push(`## Related Context\n${ragResult.answer.slice(0, MAX_RAG_CHARS)}`);
    }
  } catch (err) {
    log.debug('context-builder', 'RAG context unavailable', { error: String(err) });
  }

  // 4. Code context from indexed repository (best-effort)
  try {
    const codeElapsed = startTimer();
    const fsClient = getAgenticFSClient();
    const codeResult = await fsClient.ask(
      `Relevant source code for: ${task.title}. Focus on ${agentId} patterns and implementations.`,
      { k: 3, namespace: NS.CODE },
    );
    if (codeResult?.answer) {
      log.debug('context-builder', `Code RAG context fetched`, { answerLength: codeResult.answer.length, elapsedMs: codeElapsed() });
      parts.push(`## Codebase Context\n${codeResult.answer.slice(0, MAX_RAG_CHARS)}`);
    }
  } catch (err) {
    log.debug('context-builder', 'Code namespace RAG unavailable', { error: String(err) });
  }

  const finalContext = parts.join('\n\n');
  log.info('context-builder', `Context built for ${agentId}`, { taskId: task.id, totalLength: finalContext.length, artifactsFetched: relevant.length, elapsedMs: totalElapsed() });
  return finalContext;
}
