import type { ProjectSettings, GitHubConnectorConfig } from '@/types/settings';

export function createDefaultGitHubConfig(): GitHubConnectorConfig {
  return {
    repoUrl: '',
    branch: 'main',
    pat: null,
    patConfigured: false,
    clonePath: '.agility/repos',
    syncIntervalMinutes: 15,
    autoSync: false,
  };
}

export function createDefaultSettings(): ProjectSettings {
  return {
    version: 1,
    connectors: {
      github: createDefaultGitHubConfig(),
    },
    updatedAt: new Date().toISOString(),
  };
}
