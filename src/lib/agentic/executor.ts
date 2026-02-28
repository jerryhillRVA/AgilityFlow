import type { ModelAdapter, ModelMessage, ContentBlock } from './adapters/model-adapter';
import type { PromptAssembler } from './prompt-assembler';
import type { ToolRouter } from './tools/tool-router';
import type { Task, IterationRecord } from '@/types/task';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { log, startTimer, truncate } from './logger';

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

const SAFETY_NET_MAX_ITERATIONS = 100;
const TOOL_RESULT_TRUNCATE_LENGTH = 500;

export class AgentExecutor {
  constructor(
    private assembler: PromptAssembler,
    private adapter: ModelAdapter,
    private toolRouter: ToolRouter,
  ) {}

  async execute(agentId: string, task: Task, additionalContext?: string, maxIterationsOverride?: number): Promise<ExecutionResult> {
    const prompt = this.assembler.assemble(agentId, task, additionalContext);
    const maxIterations = maxIterationsOverride ?? prompt.maxIterations ?? SAFETY_NET_MAX_ITERATIONS;
    if (!maxIterationsOverride && !prompt.maxIterations) {
      log.warn('executor', `No iteration budget set for ${agentId} — using safety-net (${SAFETY_NET_MAX_ITERATIONS}). Set iterationBudget or maxIterations in the agent definition.`, { taskId: task.id });
    }
    const totalElapsed = startTimer();
    log.info('executor', `Starting ReAct loop for ${agentId} on "${task.title}" (max ${maxIterations} iterations)`, { taskId: task.id, model: prompt.model });
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
      log.debug('executor', `${agentId} iteration ${i + 1}/${maxIterations} — calling model`, { taskId: task.id, model: prompt.model });
      const modelElapsed = startTimer();
      const response = await this.adapter.chat({
        systemPrompt: prompt.systemPrompt,
        messages,
        tools: prompt.tools.length > 0 ? prompt.tools : undefined,
        model: prompt.model,
        maxTokens: 21000,
      });

      const inputDelta = response.usage.inputTokens;
      const outputDelta = response.usage.outputTokens;
      totalInput += inputDelta;
      totalOutput += outputDelta;

      log.info('executor', `${agentId} model response (iteration ${i + 1})`, {
        taskId: task.id,
        stopReason: response.stopReason,
        inputTokens: inputDelta,
        outputTokens: outputDelta,
        cacheRead: response.usage.cacheReadInputTokens,
        cacheCreation: response.usage.cacheCreationInputTokens,
        elapsedMs: modelElapsed(),
      });

      eventBus.emit(createEvent(
        'agent:thinking',
        `Agent ${agentId} iteration ${i + 1}/${maxIterations} (${inputDelta}in / ${outputDelta}out tokens)`,
        { iteration: i + 1, maxIterations, inputTokenDelta: inputDelta, outputTokenDelta: outputDelta, totalInputTokens: totalInput, totalOutputTokens: totalOutput },
        agentId,
        task.id,
      ));

      if (response.stopReason === 'max_tokens') {
        iterationDetails.push({
          iteration: i + 1,
          inputTokenDelta: inputDelta,
          outputTokenDelta: outputDelta,
          toolCalls: ['[truncated]'],
        });

        log.warn('executor', `Output truncated at max_tokens for ${agentId} iteration ${i + 1}/${maxIterations}`, { taskId: task.id });
        eventBus.emit(createEvent(
          'agent:error',
          `Agent ${agentId} output truncated at max_tokens on iteration ${i + 1} — skipping partial tool calls`,
          { iteration: i + 1, stopReason: 'max_tokens' },
          agentId,
          task.id,
        ));

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Your previous response was truncated because it exceeded the maximum output length. Please retry with shorter, more concise content. If writing a document, reduce its length significantly.' }] });
        continue;
      }

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      if (toolUseBlocks.length === 0 || response.stopReason === 'end_turn') {
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

        log.info('executor', `${agentId} completed in ${i + 1} iterations (${totalInput}in/${totalOutput}out tokens)`, {
          taskId: task.id,
          iterations: i + 1,
          totalInput,
          totalOutput,
          responseLength: text.length,
          responsePreview: truncate(text, 100),
          totalElapsedMs: totalElapsed(),
        });
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

        const toolElapsed = startTimer();
        const result = await this.toolRouter.execute(toolName, toolInput);
        log.info('executor', `${agentId} tool call: ${toolName}`, {
          taskId: task.id,
          iteration: i + 1,
          tool: toolName,
          inputKeys: Object.keys(toolInput),
          resultLength: result.length,
          resultPreview: truncate(result, 150),
          elapsedMs: toolElapsed(),
        });
        toolCalls.push({ toolName, input: toolInput, output: result });
        iterationToolCalls.push(toolName);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });

      iterationDetails.push({
        iteration: i + 1,
        inputTokenDelta: inputDelta,
        outputTokenDelta: outputDelta,
        toolCalls: iterationToolCalls,
      });

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

    log.error('executor', `${agentId} reached max iterations (${maxIterations}) without completion`, { taskId: task.id, totalInput, totalOutput, totalElapsedMs: totalElapsed() });
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
