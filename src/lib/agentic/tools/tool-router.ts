import { log, startTimer, truncate } from '../logger';

export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export class ToolRouter {
  private handlers: Map<string, ToolHandler> = new Map();

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      log.warn('tool-router', `Unknown tool called: ${toolName}`, { toolName, inputKeys: Object.keys(input) });
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
    const elapsed = startTimer();
    try {
      const result = await handler(input);
      const output = typeof result === 'string' ? result : JSON.stringify(result);
      log.debug('tool-router', `Tool executed: ${toolName}`, { toolName, inputKeys: Object.keys(input), resultLength: output.length, resultPreview: truncate(output, 150), elapsedMs: elapsed() });
      return output;
    } catch (error) {
      log.error('tool-router', `Tool execution failed: ${toolName}`, { toolName, inputKeys: Object.keys(input), error: String(error), stack: error instanceof Error ? error.stack : undefined, elapsedMs: elapsed() });
      return JSON.stringify({ error: String(error) });
    }
  }

  hasHandler(name: string): boolean {
    return this.handlers.has(name);
  }

  listTools(): string[] {
    return Array.from(this.handlers.keys());
  }
}
