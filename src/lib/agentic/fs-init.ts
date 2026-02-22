import type { AgenticFSClient } from '@/lib/agentic-fs-client';
import { NS, paths, PROJECT_BASE_DIRS, REGISTRY_BASE_DIRS } from './fs-paths';

/**
 * Create a directory, ignoring "already exists" errors.
 */
async function ensureDir(client: AgenticFSClient, path: string, namespace: string): Promise<void> {
  try {
    await client.createDirectory(path, namespace);
  } catch {
    // Directory may already exist — safe to ignore
  }
}

/**
 * Initialize the base directory structure for a project tenant.
 * Creates all 16 standard directories across the 6 namespaces.
 * Idempotent — safe to call multiple times.
 */
export async function initializeProject(client: AgenticFSClient): Promise<void> {
  await Promise.all(
    PROJECT_BASE_DIRS.map(({ namespace, path }) => ensureDir(client, path, namespace))
  );
}

/**
 * Initialize a sprint within the current project tenant.
 * Creates the sprint directory, tasks subdirectory, proposals subdirectory,
 * and a sprint-meta.json seed file.
 * Idempotent — safe to call multiple times.
 */
export async function initializeSprint(
  client: AgenticFSClient,
  sprintId: string,
  meta?: { name?: string; goal?: string }
): Promise<void> {
  await ensureDir(client, paths.sprints.dir(sprintId), NS.SPRINTS);
  await Promise.all([
    ensureDir(client, paths.sprints.tasks(sprintId), NS.SPRINTS),
    ensureDir(client, paths.sprints.proposals(sprintId), NS.SPRINTS),
  ]);

  const sprintMeta = {
    id: sprintId,
    name: meta?.name || sprintId,
    goal: meta?.goal || '',
    status: 'planning',
    taskIds: [],
    startDate: null,
    endDate: null,
  };

  try {
    await client.uploadFile(
      JSON.stringify(sprintMeta, null, 2),
      'sprint-meta.json',
      { namespace: NS.SPRINTS, path: paths.sprints.dir(sprintId), tags: ['sprint', 'meta'] }
    );
  } catch {
    // File may already exist
  }
}

/**
 * Initialize the memory directory for an agent.
 * Idempotent — safe to call multiple times.
 */
export async function initializeAgentMemory(
  client: AgenticFSClient,
  agentName: string
): Promise<void> {
  await ensureDir(client, paths.memory.agentDir(agentName), NS.MEMORY);
}

/**
 * Initialize the _registry tenant directory structure.
 * Creates the orgs/, portfolios/, and projects/ directories
 * under the knowledge namespace.
 *
 * Note: The caller must provide a client configured with the
 * REGISTRY_TENANT ('_registry') as its tenant.
 * Idempotent — safe to call multiple times.
 */
export async function initializeRegistry(client: AgenticFSClient): Promise<void> {
  await Promise.all(
    REGISTRY_BASE_DIRS.map(({ namespace, path }) => ensureDir(client, path, namespace))
  );
}
