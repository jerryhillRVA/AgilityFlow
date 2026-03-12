import type { ModelAdapter } from './model-adapter';
import { MockAdapter } from './mock';
import { AnthropicAdapter } from './anthropic';
import { OpenAIAdapter } from './openai';
import { log } from '../logger';

export function createAdapter(provider?: string): ModelAdapter {
  const adapterType = provider || process.env.MODEL_ADAPTER || 'mock';
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiBaseUrl = process.env.OPENAI_BASE_URL;

  switch (adapterType) {
    case 'anthropic':
      log.info('adapter', 'Creating AnthropicAdapter', { provider: 'anthropic' });
      return new AnthropicAdapter(anthropicApiKey || undefined);
    case 'openai':
      log.info('adapter', 'Creating OpenAIAdapter', { provider: 'openai', baseURL: openaiBaseUrl || 'default' });
      return new OpenAIAdapter(openaiApiKey || undefined, openaiBaseUrl || undefined);
    case 'mock':
    default:
      log.info('adapter', `Creating MockAdapter`, { provider: adapterType });
      return new MockAdapter();
  }
}

export type { ModelAdapter, ModelRequest, ModelResponse, ModelMessage, ContentBlock, ToolSchema } from './model-adapter';
