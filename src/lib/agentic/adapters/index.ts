import type { ModelAdapter } from './model-adapter';
import { MockAdapter } from './mock';
import { AnthropicAdapter } from './anthropic';

export function createAdapter(provider?: string): ModelAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (provider === 'mock' || !apiKey) {
    return new MockAdapter();
  }

  switch (provider || 'anthropic') {
    case 'anthropic':
      return new AnthropicAdapter(apiKey);
    default:
      return new MockAdapter();
  }
}

export type { ModelAdapter, ModelRequest, ModelResponse, ModelMessage, ContentBlock, ToolSchema } from './model-adapter';
