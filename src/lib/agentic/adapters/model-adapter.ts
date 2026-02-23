export interface ModelRequest {
  systemPrompt: string;
  messages: ModelMessage[];
  tools?: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
}

export interface ModelAdapter {
  name: string;
  chat(request: ModelRequest): Promise<ModelResponse>;
}
