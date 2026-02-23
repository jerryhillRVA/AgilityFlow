import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import type { Task, TaskArtifact, ArtifactCategory } from '@/types/task';

/** Maps agent roles to the artifact categories they need as context */
const AGENT_CATEGORY_MAP: Record<string, ArtifactCategory[]> = {
  'technical-writer': ['requirements', 'implementation', 'verification'],
  'backend-developer': ['requirements', 'implementation'],
  'frontend-developer': ['requirements', 'implementation'],
  'qa-analyst': ['requirements', 'implementation'],
  'code-reviewer': ['implementation', 'verification'],
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
  const relevantCategories = AGENT_CATEGORY_MAP[agentId] || ['requirements', 'implementation', 'verification'];
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
      } catch {
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
  } catch {
    // FS not available — proceed without RAG context
  }

  return parts.join('\n\n');
}
