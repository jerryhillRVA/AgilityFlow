import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

type TierName = 'fast' | 'balanced' | 'advanced';

type TierConfig = Record<string, Record<string, string>>;

interface RawModelConfig {
  default_provider?: string;
  tiers?: TierConfig;
}

export interface ResolvedModel {
  model: string;
  provider: string;
  tier: TierName;
}

const FALLBACK_MODELS: TierConfig = {
  fast: { anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini' },
  balanced: { anthropic: 'claude-sonnet-4-5-20250929', openai: 'gpt-4o' },
  advanced: { anthropic: 'claude-opus-4-6', openai: 'o3' },
};

let cachedConfig: { tiers: TierConfig; defaultProvider: string } | null = null;

function loadModelConfig(): { tiers: TierConfig; defaultProvider: string } {
  if (cachedConfig) return cachedConfig;

  try {
    const configPath = path.join(process.cwd(), 'config', 'models.yaml');
    const raw = parseYaml(fs.readFileSync(configPath, 'utf8')) as RawModelConfig;
    cachedConfig = {
      tiers: raw.tiers || FALLBACK_MODELS,
      defaultProvider: raw.default_provider || 'anthropic',
    };
    return cachedConfig;
  } catch {
    cachedConfig = {
      tiers: FALLBACK_MODELS,
      defaultProvider: 'anthropic',
    };
    return cachedConfig;
  }
}

function resolveActiveProvider(defaultProvider: string): string {
  const adapterProvider = process.env.MODEL_ADAPTER;
  if (adapterProvider && adapterProvider !== 'mock') return adapterProvider;
  return defaultProvider;
}

export function resolveModelForTier(tier: TierName): ResolvedModel {
  const { tiers, defaultProvider } = loadModelConfig();
  const activeProvider = resolveActiveProvider(defaultProvider);

  const resolved =
    tiers[tier]?.[activeProvider] ||
    tiers[tier]?.[defaultProvider] ||
    FALLBACK_MODELS[tier]?.[activeProvider] ||
    FALLBACK_MODELS[tier]?.[defaultProvider] ||
    FALLBACK_MODELS.balanced.anthropic;

  return {
    model: resolved,
    provider: activeProvider,
    tier,
  };
}

