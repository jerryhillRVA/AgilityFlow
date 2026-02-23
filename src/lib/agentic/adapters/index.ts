import type { ModelAdapter } from './model-adapter';
import { MockAdapter } from './mock';
import { AnthropicAdapter } from './anthropic';

export function createAdapter(provider?: string): ModelAdapter {
  const adapterType = provider || process.env.MODEL_ADAPTER || 'mock';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  switch (adapterType) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey || undefined);
    case 'mock':
    default:
      return new MockAdapter();
  }
}

export type { ModelAdapter, ModelRequest, ModelResponse, ModelMessage, ContentBlock, ToolSchema } from './model-adapter';
