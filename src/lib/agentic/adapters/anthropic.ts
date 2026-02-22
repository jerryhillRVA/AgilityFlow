import Anthropic from '@anthropic-ai/sdk';
import type { ModelAdapter, ModelRequest, ModelResponse, ContentBlock } from './model-adapter';

export class AnthropicAdapter implements ModelAdapter {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const model = request.model || 'claude-sonnet-4-5-20250929';

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages: request.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as Anthropic.MessageParam['content'],
      })),
    };

    if (request.tools?.length) {
      params.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      }));
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    const response = await this.client.messages.create(params);

    return {
      content: response.content.map((block): ContentBlock => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        return { type: 'text', text: '' };
      }),
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
