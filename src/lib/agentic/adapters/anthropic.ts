import Anthropic from '@anthropic-ai/sdk';
import type { ModelAdapter, ModelRequest, ModelResponse, ContentBlock } from './model-adapter';
import { log, startTimer } from '../logger';

export class AnthropicAdapter implements ModelAdapter {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  }

  private async chatWithRetry(
    params: Anthropic.MessageCreateParams,
    maxRetries = 5,
  ): Promise<Anthropic.Message> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.messages.create({ ...params, stream: false });
      } catch (error: unknown) {
        const isRateLimit =
          error instanceof Anthropic.RateLimitError ||
          (error instanceof Error && 'status' in error && (error as { status: number }).status === 429);

        if (!isRateLimit || attempt === maxRetries) {
          log.error('anthropic', `API call failed`, { model: params.model, attempt: attempt + 1, isRateLimit, error: String(error) });
          throw error;
        }

        // Exponential backoff: 15s, 30s, 60s, 120s, 240s
        const backoffMs = 15_000 * Math.pow(2, attempt);
        const retryAfter = this.parseRetryAfter(error);
        const waitMs = retryAfter ? retryAfter * 1000 : backoffMs;

        log.warn('anthropic', `Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${(waitMs / 1000).toFixed(0)}s`, { model: params.model, attempt: attempt + 1, maxRetries: maxRetries + 1, waitMs });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
    throw new Error('Unreachable');
  }

  private parseRetryAfter(error: unknown): number | null {
    if (error && typeof error === 'object' && 'headers' in error) {
      const headers = (error as { headers?: Record<string, string> }).headers;
      const retryAfter = headers?.['retry-after'];
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        if (!isNaN(seconds) && seconds > 0 && seconds < 300) return seconds;
      }
    }
    return null;
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const model = request.model || 'claude-sonnet-4-5-20250929';
    const toolCount = request.tools?.length || 0;

    log.debug('anthropic', `API call starting`, { model, maxTokens: request.maxTokens || 21000, toolCount, messageCount: request.messages.length });
    const elapsed = startTimer();

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: request.maxTokens || 21000,
      system: [
        {
          type: 'text' as const,
          text: request.systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
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

    const response = await this.chatWithRetry(params);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheRead = (response.usage as unknown as Record<string, number>).cache_read_input_tokens || 0;
    const cacheCreation = (response.usage as unknown as Record<string, number>).cache_creation_input_tokens || 0;

    log.info('anthropic', `API call completed`, {
      model,
      stopReason: response.stop_reason,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheCreation,
      elapsedMs: elapsed(),
    });

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
        inputTokens,
        outputTokens,
        cacheReadInputTokens: cacheRead,
        cacheCreationInputTokens: cacheCreation,
      },
    };
  }
}
