import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { ModelAdapter, ModelRequest, ModelResponse, ContentBlock, ModelMessage } from './model-adapter';
import { log, startTimer } from '../logger';

const DEFAULT_MODEL = 'gpt-4o';

function asTextContent(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('');
}

function toOpenAIMessages(messages: ModelMessage[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      result.push({ role: message.role, content: message.content });
      continue;
    }

    const blocks = message.content;
    const text = asTextContent(blocks);

    if (message.role === 'assistant') {
      const toolCalls = blocks
        .filter(b => b.type === 'tool_use' && b.name && b.id)
        .map((b): ChatCompletionMessageToolCall => ({
          id: b.id!,
          type: 'function',
          function: {
            name: b.name!,
            arguments: JSON.stringify(b.input || {}),
          },
        }));

      result.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    const toolResults = blocks.filter(b => b.type === 'tool_result' && b.tool_use_id);
    if (toolResults.length > 0) {
      for (const block of toolResults) {
        result.push({
          role: 'tool',
          tool_call_id: block.tool_use_id!,
          content: typeof block.content === 'string' ? block.content : '',
        });
      }
      continue;
    }

    result.push({ role: 'user', content: text });
  }

  return result;
}

function mapStopReason(reason: string | null): string {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  return 'end_turn';
}

function mapResponseStopReason(response: OpenAI.Responses.Response): string {
  const hasFunctionCalls = response.output.some(item => item.type === 'function_call');
  if (hasFunctionCalls) return 'tool_use';

  if (
    response.status === 'incomplete' &&
    response.incomplete_details?.reason === 'max_output_tokens'
  ) {
    return 'max_tokens';
  }

  return 'end_turn';
}

function isChatEndpointMismatch(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes('not a chat model') || message.includes('v1/chat/completions');
}

function isResponsesEndpointMismatch(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes('v1/responses') || message.includes('responses endpoint');
}

function shouldPreferResponsesEndpoint(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.startsWith('gpt-5') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4') || lower.includes('codex');
}

function toCompletionPrompt(systemPrompt: string, messages: ModelMessage[]): string {
  const sections: string[] = [`System:\n${systemPrompt}`];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      sections.push(`${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`);
      continue;
    }

    const text = asTextContent(message.content);
    const lines: string[] = [];
    if (text) lines.push(text);

    for (const block of message.content) {
      if (block.type === 'tool_use' && block.name && block.id) {
        lines.push(
          `[tool_call name="${block.name}" id="${block.id}"] ${JSON.stringify(block.input || {})}`,
        );
      } else if (block.type === 'tool_result' && block.tool_use_id) {
        lines.push(`[tool_result id="${block.tool_use_id}"] ${typeof block.content === 'string' ? block.content : ''}`);
      }
    }

    sections.push(`${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${lines.join('\n')}`.trim());
  }

  sections.push('Assistant:');
  return sections.join('\n\n');
}

function makeStrictJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(item => makeStrictJsonSchema(item));

  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const propsOut: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        propsOut[propName] = makeStrictJsonSchema(propSchema);
      }
      out[key] = propsOut;
      continue;
    }

    if (key === 'items') {
      out[key] = makeStrictJsonSchema(value);
      continue;
    }

    if ((key === 'anyOf' || key === 'allOf' || key === 'oneOf') && Array.isArray(value)) {
      out[key] = value.map(item => makeStrictJsonSchema(item));
      continue;
    }

    out[key] = value;
  }

  if (source.type === 'object' && !('additionalProperties' in out)) {
    out.additionalProperties = false;
  }

  return out;
}

function makeStrictObjectSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized = makeStrictJsonSchema(schema);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return { type: 'object', additionalProperties: false };
  }
  return normalized as Record<string, unknown>;
}

function makeResponsesStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const root = makeStrictObjectSchema(schema);

  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(item => visit(item));

    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
      if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
        const srcProps = value as Record<string, unknown>;
        const srcRequired = Array.isArray(source.required) ? source.required.filter(r => typeof r === 'string') as string[] : [];
        const requiredSet = new Set(srcRequired);

        const propsOut: Record<string, unknown> = {};
        for (const [propName, propSchema] of Object.entries(srcProps)) {
          const visitedProp = visit(propSchema);

          // Responses strict function schema requires all properties to be listed in required.
          // Preserve prior optionality by permitting null for fields that were not previously required.
          if (!requiredSet.has(propName)) {
            propsOut[propName] = {
              anyOf: [
                visitedProp as Record<string, unknown>,
                { type: 'null' },
              ],
            };
          } else {
            propsOut[propName] = visitedProp;
          }
        }

        out.properties = propsOut;
        out.required = Object.keys(srcProps);
        continue;
      }

      if (key === 'items') {
        out[key] = visit(value);
        continue;
      }

      if ((key === 'anyOf' || key === 'allOf' || key === 'oneOf') && Array.isArray(value)) {
        out[key] = value.map(item => visit(item));
        continue;
      }

      if (key !== 'required') {
        out[key] = value;
      }
    }

    if (source.type === 'object' && !('additionalProperties' in out)) {
      out.additionalProperties = false;
    }

    return out;
  };

  return visit(root) as Record<string, unknown>;
}

function toResponsesInput(messages: ModelMessage[]): ResponseCreateParamsNonStreaming['input'] {
  const input: NonNullable<ResponseCreateParamsNonStreaming['input']> = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: message.content });
      continue;
    }

    const blocks = message.content;
    const text = asTextContent(blocks);

    if (message.role === 'assistant') {
      if (text) {
        input.push({ role: 'assistant', content: text });
      }

      for (const block of blocks) {
        if (block.type !== 'tool_use' || !block.id || !block.name) continue;
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        });
      }
      continue;
    }

    if (text) {
      input.push({ role: 'user', content: text });
    }

    for (const block of blocks) {
      if (block.type !== 'tool_result' || !block.tool_use_id) continue;
      input.push({
        type: 'function_call_output',
        call_id: block.tool_use_id,
        output: typeof block.content === 'string' ? block.content : '',
      });
    }
  }

  return input;
}

export class OpenAIAdapter implements ModelAdapter {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      ...(baseURL || process.env.OPENAI_BASE_URL ? { baseURL: baseURL || process.env.OPENAI_BASE_URL } : {}),
    });
  }

  private async chatWithRetry(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    maxRetries = 5,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create(params);
      } catch (error: unknown) {
        const status = typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: number }).status)
          : undefined;
        const isRetriable = status === 429 || (status !== undefined && status >= 500);

        if (!isRetriable || attempt === maxRetries) {
          log.error('openai', 'API call failed', {
            model: params.model,
            attempt: attempt + 1,
            status,
            error: String(error),
          });
          throw error;
        }

        const waitMs = 1000 * Math.pow(2, attempt);
        log.warn('openai', `Retriable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${(waitMs / 1000).toFixed(0)}s`, {
          model: params.model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          waitMs,
          status,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    throw new Error('Unreachable');
  }

  private async responsesWithRetry(
    params: ResponseCreateParamsNonStreaming,
    maxRetries = 5,
  ): Promise<OpenAI.Responses.Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.responses.create(params);
      } catch (error: unknown) {
        const status = typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: number }).status)
          : undefined;
        const isRetriable = status === 429 || (status !== undefined && status >= 500);

        if (!isRetriable || attempt === maxRetries) {
          log.error('openai', 'API call failed', {
            endpoint: 'responses',
            model: params.model,
            attempt: attempt + 1,
            status,
            error: String(error),
          });
          throw error;
        }

        const waitMs = 1000 * Math.pow(2, attempt);
        log.warn('openai', `Retriable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${(waitMs / 1000).toFixed(0)}s`, {
          endpoint: 'responses',
          model: params.model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          waitMs,
          status,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    throw new Error('Unreachable');
  }

  private async completionsWithRetry(
    params: OpenAI.Completions.CompletionCreateParamsNonStreaming,
    maxRetries = 5,
  ): Promise<OpenAI.Completions.Completion> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.completions.create(params);
      } catch (error: unknown) {
        const status = typeof error === 'object' && error && 'status' in error
          ? Number((error as { status?: number }).status)
          : undefined;
        const isRetriable = status === 429 || (status !== undefined && status >= 500);

        if (!isRetriable || attempt === maxRetries) {
          log.error('openai', 'API call failed', {
            endpoint: 'completions',
            model: params.model,
            attempt: attempt + 1,
            status,
            error: String(error),
          });
          throw error;
        }

        const waitMs = 1000 * Math.pow(2, attempt);
        log.warn('openai', `Retriable error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${(waitMs / 1000).toFixed(0)}s`, {
          endpoint: 'completions',
          model: params.model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          waitMs,
          status,
        });
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    throw new Error('Unreachable');
  }

  private async chatViaCompletions(request: ModelRequest, model: string): Promise<ModelResponse> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        ...toOpenAIMessages(request.messages),
      ],
      ...(request.maxTokens !== undefined ? { max_completion_tokens: request.maxTokens } : {}),
    };

    if (request.tools?.length) {
      params.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: makeStrictObjectSchema(t.input_schema),
        },
      }));
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    const response = await this.chatWithRetry(params);
    const choice = response.choices[0];
    const message = choice?.message;

    const content: ContentBlock[] = [];
    if (message?.content) {
      content.push({ type: 'text', text: message.content });
    }

    for (const toolCall of message?.tool_calls || []) {
      if (toolCall.type !== 'function') continue;
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        parsedInput = {};
      }

      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      });
    }

    return {
      content,
      stopReason: mapStopReason(choice?.finish_reason || null),
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  private async chatViaResponses(request: ModelRequest, model: string): Promise<ModelResponse> {
    const params: ResponseCreateParamsNonStreaming = {
      model,
      instructions: request.systemPrompt,
      input: toResponsesInput(request.messages),
      ...(request.maxTokens !== undefined ? { max_output_tokens: request.maxTokens } : {}),
    };

    if (request.tools?.length) {
      params.tools = request.tools.map(t => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: makeResponsesStrictSchema(t.input_schema),
        strict: true,
      }));

      const delegateTool = params.tools.find(t => t.type === 'function' && t.name === 'delegate_to_agent');
      if (delegateTool && delegateTool.type === 'function') {
        const parameters = delegateTool.parameters && typeof delegateTool.parameters === 'object'
          ? delegateTool.parameters as Record<string, unknown>
          : {};
        log.debug('openai', 'Responses tool schema prepared', {
          tool: delegateTool.name,
          strict: delegateTool.strict,
          type: parameters.type,
          additionalProperties: parameters.additionalProperties,
          required: parameters.required,
        });
      }
    }

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    const response = await this.responsesWithRetry(params);

    const content: ContentBlock[] = [];
    if (response.output_text) {
      content.push({ type: 'text', text: response.output_text });
    }

    for (const item of response.output) {
      if (item.type !== 'function_call') continue;

      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(item.arguments || '{}') as Record<string, unknown>;
      } catch {
        parsedInput = {};
      }

      content.push({
        type: 'tool_use',
        id: item.call_id,
        name: item.name,
        input: parsedInput,
      });
    }

    return {
      content,
      stopReason: mapResponseStopReason(response),
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        cacheReadInputTokens: response.usage?.input_tokens_details?.cached_tokens || 0,
      },
    };
  }

  private async chatViaCompletionsLegacy(request: ModelRequest, model: string): Promise<ModelResponse> {
    if (request.tools?.length) {
      throw new Error('Legacy completions endpoint does not support function tools');
    }

    const response = await this.completionsWithRetry({
      model,
      prompt: toCompletionPrompt(request.systemPrompt, request.messages),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    });

    const choice = response.choices[0];
    return {
      content: [{ type: 'text', text: choice?.text || '' }],
      stopReason: mapStopReason(choice?.finish_reason || null),
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const model = request.model || DEFAULT_MODEL;
    const toolCount = request.tools?.length || 0;
    let endpoint: 'chat.completions' | 'responses' | 'completions' = shouldPreferResponsesEndpoint(model) ? 'responses' : 'chat.completions';

    log.debug('openai', 'API call starting', {
      model,
      maxTokens: request.maxTokens || 21000,
      toolCount,
      messageCount: request.messages.length,
      endpoint,
    });
    const elapsed = startTimer();

    let result: ModelResponse;
    try {
      result = endpoint === 'responses'
        ? await this.chatViaResponses(request, model)
        : await this.chatViaCompletions(request, model);
    } catch (error: unknown) {
      if (endpoint === 'chat.completions' && isChatEndpointMismatch(error)) {
        log.warn('openai', 'Chat Completions rejected model; retrying with Responses API', { model });
        try {
          endpoint = 'responses';
          result = await this.chatViaResponses(request, model);
        } catch (responseError: unknown) {
          if (!toolCount && isResponsesEndpointMismatch(responseError)) {
            log.warn('openai', 'Responses API also rejected model; retrying with legacy Completions API', { model });
            endpoint = 'completions';
            result = await this.chatViaCompletionsLegacy(request, model);
          } else {
            throw responseError;
          }
        }
      } else if (endpoint === 'responses' && isResponsesEndpointMismatch(error)) {
        log.warn('openai', 'Responses API rejected model; retrying with Chat Completions', { model });
        try {
          endpoint = 'chat.completions';
          result = await this.chatViaCompletions(request, model);
        } catch (chatError: unknown) {
          if (!toolCount && isChatEndpointMismatch(chatError)) {
            log.warn('openai', 'Chat Completions also rejected model; retrying with legacy Completions API', { model });
            endpoint = 'completions';
            result = await this.chatViaCompletionsLegacy(request, model);
          } else {
            throw chatError;
          }
        }
      } else {
        throw error;
      }
    }

    log.info('openai', 'API call completed', {
      model,
      endpoint,
      stopReason: result.stopReason,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheRead: result.usage.cacheReadInputTokens,
      elapsedMs: elapsed(),
    });

    return result;
  }
}
