import type { ModelAdapter, ModelMessage, ContentBlock } from './adapters/model-adapter';
import type { PromptAssembler } from './prompt-assembler';
import type { ToolRouter } from './tools/tool-router';
import type { Task } from '@/types/task';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';

export interface ExecutionResult {
  agentId: string;
  taskId: string;
  response: string;
  toolCalls: ToolCallRecord[];
  usage: { totalInputTokens: number; totalOutputTokens: number };
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
}

export class AgentExecutor {
  private maxIterations = 10;

  constructor(
    private assembler: PromptAssembler,
    private adapter: ModelAdapter,
    private toolRouter: ToolRouter,
  ) {}

  async execute(agentId: string, task: Task, additionalContext?: string): Promise<ExecutionResult> {
    const prompt = this.assembler.assemble(agentId, task, additionalContext);
    const messages: ModelMessage[] = [{ role: 'user', content: prompt.userMessage }];
    const toolCalls: ToolCallRecord[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    eventBus.emit(createEvent(
      'agent:started',
      `Agent ${agentId} started on: ${task.title}`,
      { agentId, taskTitle: task.title },
      agentId,
      task.id,
    ));

    for (let i = 0; i < this.maxIterations; i++) {
      eventBus.emit(createEvent(
        'agent:thinking',
        `Agent ${agentId} thinking (iteration ${i + 1})...`,
        { iteration: i + 1 },
        agentId,
        task.id,
      ));

      const response = await this.adapter.chat({
        systemPrompt: prompt.systemPrompt,
        messages,
        tools: prompt.tools.length > 0 ? prompt.tools : undefined,
      });

      totalInput += response.usage.inputTokens;
      totalOutput += response.usage.outputTokens;

      // Check for tool use blocks
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
        // Final text response
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('');

        eventBus.emit(createEvent(
          'agent:completed',
          `Agent ${agentId} completed: ${task.title}`,
          { response: text.slice(0, 200) },
          agentId,
          task.id,
        ));

        return {
          agentId,
          taskId: task.id,
          response: text,
          toolCalls,
          usage: { totalInputTokens: totalInput, totalOutputTokens: totalOutput },
        };
      }

      // Process tool calls
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: ContentBlock[] = [];
      for (const block of toolUseBlocks) {
        const toolName = block.name!;
        const toolInput = block.input || {};

        eventBus.emit(createEvent(
          'agent:tool_call',
          `Agent ${agentId} calling tool: ${toolName}`,
          { tool: toolName, input: toolInput },
          agentId,
          task.id,
        ));

        const result = await this.toolRouter.execute(toolName, toolInput);
        toolCalls.push({ toolName, input: toolInput, output: result });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // Max iterations reached
    eventBus.emit(createEvent(
      'agent:error',
      `Agent ${agentId} reached max iterations (${this.maxIterations})`,
      {},
      agentId,
      task.id,
    ));

    return {
      agentId,
      taskId: task.id,
      response: 'Max iterations reached without completion.',
      toolCalls,
      usage: { totalInputTokens: totalInput, totalOutputTokens: totalOutput },
    };
  }
}
