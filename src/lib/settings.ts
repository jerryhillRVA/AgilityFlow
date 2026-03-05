import type { ProjectSettings, GitHubConnectorConfig, TestingConfig } from '@/types/settings';

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

export function createDefaultTestingConfig(): TestingConfig {
  return {
    testEnvironmentUrl: 'http://localhost:3000',
  };
}

export function createDefaultSettings(): ProjectSettings {
  return {
    version: 1,
    connectors: {
      github: createDefaultGitHubConfig(),
    },
    testing: createDefaultTestingConfig(),
    updatedAt: new Date().toISOString(),
  };
}
