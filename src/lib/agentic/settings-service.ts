import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NS, paths } from './fs-paths';
import { encrypt, decrypt, isEncryptionAvailable } from '@/lib/crypto';
import { createDefaultSettings } from '@/lib/settings';
import type { ProjectSettings, ConnectorRuntimeStatus } from '@/types/settings';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';

const SETTINGS_FILENAME = 'settings.json';

export class SettingsService {
  private settings: ProjectSettings | null = null;
  private fileId: string | null = null;
  private runtimeStatus: { github: ConnectorRuntimeStatus } = {
    github: { status: 'disconnected' },
  };

  /** Load settings from Agentic FS. Creates default if not found. */
  async load(): Promise<ProjectSettings> {
    if (this.settings) return this.settings;

    const client = getAgenticFSClient();
    try {
      const listing = await client.listDirectory(paths.settings.dir(), NS.SETTINGS);
      const settingsEntry = listing.entries.find(
        e => e.type === 'file' && e.name === SETTINGS_FILENAME,
      );

      if (settingsEntry?.file_id) {
        const content = await client.downloadFile(settingsEntry.file_id);
        this.settings = JSON.parse(content) as ProjectSettings;
        this.fileId = settingsEntry.file_id;
      }
    } catch {
      // Directory or file doesn't exist yet
    }

    if (!this.settings) {
      this.settings = createDefaultSettings();
      await this.save();
    }

    return this.settings;
  }

  /** Save current settings to Agentic FS */
  async save(): Promise<void> {
    if (!this.settings) return;
    this.settings.updatedAt = new Date().toISOString();

    const client = getAgenticFSClient();
    const content = JSON.stringify(this.settings, null, 2);

    try {
      if (this.fileId) {
        await client.replaceFile(this.fileId, content, SETTINGS_FILENAME);
      } else {
        const result = await client.uploadFile(content, SETTINGS_FILENAME, {
          namespace: NS.SETTINGS,
          path: paths.settings.dir(),
          tags: ['settings', 'config'],
        });
        this.fileId = result.file_id;
      }
    } catch (error) {
      eventBus.emit(createEvent(
        'system:error',
        `Failed to save settings: ${String(error)}`,
        { error: String(error) },
      ));
    }
  }

  /** Update GitHub connector config. Encrypts PAT if provided as plaintext. */
  async updateGitHubConfig(update: {
    repoUrl?: string;
    branch?: string;
    pat?: string;
    clonePath?: string;
    syncIntervalMinutes?: number;
    autoSync?: boolean;
  }): Promise<void> {
    const settings = await this.load();
    const github = settings.connectors.github;

    if (update.repoUrl !== undefined) github.repoUrl = update.repoUrl;
    if (update.branch !== undefined) github.branch = update.branch;
    if (update.clonePath !== undefined) github.clonePath = update.clonePath;
    if (update.syncIntervalMinutes !== undefined) github.syncIntervalMinutes = update.syncIntervalMinutes;
    if (update.autoSync !== undefined) github.autoSync = update.autoSync;

    if (update.pat !== undefined && update.pat !== '') {
      if (!isEncryptionAvailable()) {
        throw new Error('ROOT_SECRET is not configured. Cannot encrypt PAT.');
      }
      const tenant = process.env.AGENTIC_FS_TENANT || 'default';
      github.pat = await encrypt(update.pat, tenant);
      github.patConfigured = true;
    }

    await this.save();
  }

  /** Decrypt and return the GitHub PAT. Server-only. */
  async getDecryptedPAT(): Promise<string | null> {
    const settings = await this.load();
    const { pat } = settings.connectors.github;
    if (!pat) return null;

    const tenant = process.env.AGENTIC_FS_TENANT || 'default';
    return decrypt(pat, tenant);
  }

  /** Get sanitized settings safe for the client (no encrypted secrets) */
  async getClientSettings(): Promise<{
    settings: ProjectSettings;
    runtime: { github: ConnectorRuntimeStatus };
    encryption: { available: boolean };
  }> {
    const settings = await this.load();
    // Deep clone and strip the pat field
    const sanitized = JSON.parse(JSON.stringify(settings)) as ProjectSettings;
    sanitized.connectors.github.pat = null;

    return {
      settings: sanitized,
      runtime: { ...this.runtimeStatus },
      encryption: { available: isEncryptionAvailable() },
    };
  }

  /** Update runtime status (called by the GitHub connector service) */
  setGitHubRuntimeStatus(status: Partial<ConnectorRuntimeStatus>): void {
    this.runtimeStatus.github = { ...this.runtimeStatus.github, ...status };
  }

  getGitHubRuntimeStatus(): ConnectorRuntimeStatus {
    return this.runtimeStatus.github;
  }
}

// Singleton via globalThis (consistent with orchestrator, eventBus, etc.)
const settingsKey = '__agilityflow_settings__' as const;
export function getSettingsService(): SettingsService {
  let service = (globalThis as Record<string, unknown>)[settingsKey] as SettingsService | undefined;
  if (!service) {
    service = new SettingsService();
    (globalThis as Record<string, unknown>)[settingsKey] = service;
  }
  return service;
}
