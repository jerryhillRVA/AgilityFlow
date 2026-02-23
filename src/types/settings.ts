import type { EncryptedPayload } from '@/lib/crypto';

/** Connector runtime status */
export type ConnectorStatus = 'disconnected' | 'connected' | 'syncing' | 'error';

/** GitHub connector configuration (persisted to Agentic FS) */
export interface GitHubConnectorConfig {
  /** Repository URL (e.g., https://github.com/owner/repo) */
  repoUrl: string;
  /** Branch to track (default: main) */
  branch: string;
  /** Encrypted GitHub PAT — never sent to client */
  pat: EncryptedPayload | null;
  /** Whether a PAT has been configured (safe UI hint) */
  patConfigured: boolean;
  /** Local clone path relative to project root */
  clonePath: string;
  /** Background sync interval in minutes */
  syncIntervalMinutes: number;
  /** Whether auto-sync is enabled */
  autoSync: boolean;
}

/** Per-connector runtime status (in-memory, not persisted) */
export interface ConnectorRuntimeStatus {
  status: ConnectorStatus;
  lastSyncAt?: string;
  lastError?: string;
  filesIndexed?: number;
}

/** Full settings document stored on Agentic FS */
export interface ProjectSettings {
  version: 1;
  connectors: {
    github: GitHubConnectorConfig;
  };
  updatedAt: string;
}
