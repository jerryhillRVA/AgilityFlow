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
  /** ISO 8601 timestamp of last successful sync (persisted for incremental sync) */
  lastSyncedAt?: string;
}

/** Per-connector runtime status (in-memory, not persisted) */
export interface ConnectorRuntimeStatus {
  status: ConnectorStatus;
  lastSyncAt?: string;
  lastError?: string;
  filesIndexed?: number;
}

/** Testing configuration */
export interface TestingConfig {
  /** Base URL of the test environment (e.g., http://localhost:3000) */
  testEnvironmentUrl: string;
}

/** Full settings document stored on Agentic FS */
export interface ProjectSettings {
  version: 1;
  connectors: {
    github: GitHubConnectorConfig;
  };
  testing: TestingConfig;
  updatedAt: string;
}
