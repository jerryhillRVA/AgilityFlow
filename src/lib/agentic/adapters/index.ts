import type { ModelAdapter } from './model-adapter';
import { MockAdapter } from './mock';
import { AnthropicAdapter } from './anthropic';
import { log } from '../logger';

export function createAdapter(provider?: string): ModelAdapter {
  const adapterType = provider || process.env.MODEL_ADAPTER || 'mock';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  switch (adapterType) {
    case 'anthropic':
      log.info('adapter', `Creating AnthropicAdapter`, { provider: 'anthropic' });
      return new AnthropicAdapter(apiKey || undefined);
    case 'mock':
    default:
      log.info('adapter', `Creating MockAdapter`, { provider: adapterType });
      return new MockAdapter();
  }
}

export type { ModelAdapter, ModelRequest, ModelResponse, ModelMessage, ContentBlock, ToolSchema } from './model-adapter';
