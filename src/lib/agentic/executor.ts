import type { ModelAdapter, ModelMessage, ContentBlock } from './adapters/model-adapter';
import type { PromptAssembler } from './prompt-assembler';
import type { ToolRouter } from './tools/tool-router';
import type { Task, IterationRecord } from '@/types/task';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';

export interface ExecutionResult {
  agentId: string;
  taskId: string;
  response: string;
  toolCalls: ToolCallRecord[];
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    iterationDetails: IterationRecord[];
  };
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
}

const DEFAULT_MAX_ITERATIONS = 50;
const TOOL_RESULT_TRUNCATE_LENGTH = 500;

export class AgentExecutor {
  constructor(
    private assembler: PromptAssembler,
    private adapter: ModelAdapter,
    private toolRouter: ToolRouter,
  ) {}

  async execute(agentId: string, task: Task, additionalContext?: string, maxIterationsOverride?: number): Promise<ExecutionResult> {
    const prompt = this.assembler.assemble(agentId, task, additionalContext);
    const maxIterations = maxIterationsOverride || prompt.maxIterations || DEFAULT_MAX_ITERATIONS;
    const messages: ModelMessage[] = [{ role: 'user', content: prompt.userMessage }];
    const toolCalls: ToolCallRecord[] = [];
    const iterationDetails: IterationRecord[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    eventBus.emit(createEvent(
      'agent:started',
      `Agent ${agentId} started on: ${task.title}`,
      { agentId, taskTitle: task.title },
      agentId,
      task.id,
    ));

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.adapter.chat({
        systemPrompt: prompt.systemPrompt,
        messages,
        tools: prompt.tools.length > 0 ? prompt.tools : undefined,
      });

      const inputDelta = response.usage.inputTokens;
      const outputDelta = response.usage.outputTokens;
      totalInput += inputDelta;
      totalOutput += outputDelta;

      // Emit after model call so per-iteration deltas are available
      eventBus.emit(createEvent(
        'agent:thinking',
        `Agent ${agentId} iteration ${i + 1}/${maxIterations} (${inputDelta}in / ${outputDelta}out tokens)`,
        { iteration: i + 1, maxIterations, inputTokenDelta: inputDelta, outputTokenDelta: outputDelta, totalInputTokens: totalInput, totalOutputTokens: totalOutput },
        agentId,
        task.id,
      ));

      // If output was truncated (max_tokens), don't execute partial tool calls
      if (response.stopReason === 'max_tokens') {
        iterationDetails.push({
          iteration: i + 1,
          inputTokenDelta: inputDelta,
          outputTokenDelta: outputDelta,
          toolCalls: ['[truncated]'],
        });

        eventBus.emit(createEvent(
          'agent:error',
          `Agent ${agentId} output truncated at max_tokens on iteration ${i + 1} — skipping partial tool calls`,
          { iteration: i + 1, stopReason: 'max_tokens' },
          agentId,
          task.id,
        ));

        // Add assistant message and a user message telling the model to be more concise
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Your previous response was truncated because it exceeded the maximum output length. Please retry with shorter, more concise content. If writing a document, reduce its length significantly.' }] });
        continue;
      }

      // Check for tool use blocks
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
        // Final text response — record iteration and return
        iterationDetails.push({
          iteration: i + 1,
          inputTokenDelta: inputDelta,
          outputTokenDelta: outputDelta,
          toolCalls: [],
        });

        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('');

        eventBus.emit(createEvent(
          'agent:completed',
          `Agent ${agentId} completed (${i + 1} iterations, ${totalInput}in / ${totalOutput}out tokens): ${task.title}`,
          { response: text.slice(0, 200), iterations: i + 1, totalInputTokens: totalInput, totalOutputTokens: totalOutput },
          agentId,
          task.id,
        ));

        return {
          agentId,
          taskId: task.id,
          response: text,
          toolCalls,
          usage: { totalInputTokens: totalInput, totalOutputTokens: totalOutput, iterationDetails },
        };
      }

      // Process tool calls
      messages.push({ role: 'assistant', content: response.content });

      const iterationToolCalls: string[] = [];
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
        iterationToolCalls.push(toolName);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });

      // Record iteration details
      iterationDetails.push({
        iteration: i + 1,
        inputTokenDelta: inputDelta,
        outputTokenDelta: outputDelta,
        toolCalls: iterationToolCalls,
      });

      // Truncate old tool results to prevent exponential context growth.
      // Walk all previous user messages (except the one we just pushed) and
      // truncate tool_result content blocks that are too long.
      for (let j = 0; j < messages.length - 1; j++) {
        const msg = messages[j];
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (const block of msg.content as ContentBlock[]) {
            if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > TOOL_RESULT_TRUNCATE_LENGTH) {
              block.content = block.content.slice(0, TOOL_RESULT_TRUNCATE_LENGTH) + '\n... [truncated]';
            }
          }
        }
      }
    }

    // Max iterations reached
    eventBus.emit(createEvent(
      'agent:error',
      `Agent ${agentId} reached max iterations (${maxIterations}), ${totalInput}in / ${totalOutput}out tokens`,
      { maxIterations, totalInputTokens: totalInput, totalOutputTokens: totalOutput },
      agentId,
      task.id,
    ));

    return {
      agentId,
      taskId: task.id,
      response: 'Max iterations reached without completion.',
      toolCalls,
      usage: { totalInputTokens: totalInput, totalOutputTokens: totalOutput, iterationDetails },
    };
  }
}
