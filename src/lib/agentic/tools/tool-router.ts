export type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export class ToolRouter {
  private handlers: Map<string, ToolHandler> = new Map();

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
    try {
      const result = await handler(input);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
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
