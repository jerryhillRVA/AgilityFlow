import type { ModelAdapter } from './adapters/model-adapter';
import type { PromptAssembler } from './prompt-assembler';
import type { ToolRouter } from './tools/tool-router';
import type { Task } from '@/types/task';
import { AgentExecutor } from './executor';
import { buildAgentContext } from './context-builder';
import { parseArtifacts } from './artifact-parser';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';

interface WaveGroup {
  waveNumber: number;
  subtasks: Task[];
}

/**
 * Executes subtasks in sequential waves based on executionOrder.
 * Within each wave, agents run sequentially so each can see the prior agent's output.
 *
 * Fallback strategy per subtask:
 *   Tier 1: ReWOO single-shot (no tools, artifact delimiters)
 *   Tier 2: ReAct iterative loop (existing AgentExecutor)
 */
export class WaveExecutor {
  private static readonly SUB_AGENT_MAX_ITERATIONS = 5;

  constructor(
    private assembler: PromptAssembler,
    private adapter: ModelAdapter,
    private toolRouter: ToolRouter,
  ) {}

  /**
   * Execute all subtasks grouped by executionOrder.
   * Each wave's agents run sequentially so later agents see prior artifacts.
   */
  async executeWaves(
    parentTask: Task,
    subtasks: Task[],
    createTaskToolRouter: (taskId: string) => ToolRouter,
  ): Promise<void> {
    const waves = this.groupByWave(subtasks);

    for (const wave of waves) {
      eventBus.emit(createEvent(
        'wave:started',
        `Wave ${wave.waveNumber}: ${wave.subtasks.map(s => s.assignedAgent || 'unassigned').join(', ')}`,
        { waveNumber: wave.waveNumber, agentCount: wave.subtasks.length },
        'orchestrator',
        parentTask.id,
      ));

      // Agents within a wave run SEQUENTIALLY
      for (const subtask of wave.subtasks) {
        const taskToolRouter = createTaskToolRouter(subtask.id);
        await this.executeSubtask(parentTask, subtask, taskToolRouter);
      }

      eventBus.emit(createEvent(
        'wave:completed',
        `Wave ${wave.waveNumber} complete`,
        { waveNumber: wave.waveNumber },
        'orchestrator',
        parentTask.id,
      ));
    }
  }

  /**
   * Execute a single subtask with 2-tier fallback:
   *   Tier 1: ReWOO single-shot
   *   Tier 2: ReAct iterative loop
   */
  private async executeSubtask(
    parentTask: Task,
    subtask: Task,
    taskToolRouter: ToolRouter,
  ): Promise<void> {
    const agentId = subtask.assignedAgent;
    if (!agentId) return;

    eventBus.emit(createEvent(
      'wave:agent_started',
      `Agent ${agentId} starting on "${subtask.title}"`,
      { agentId, subtaskId: subtask.id },
      agentId,
      subtask.id,
    ));

    // Update subtask status
    subtask.status = 'in-progress';
    subtask.updatedAt = new Date().toISOString();

    try {
      // Build pre-fetched context from parent + prior artifacts
      const priorArtifacts = parentTask.artifacts || [];
      const context = await buildAgentContext(parentTask, agentId, priorArtifacts);

      try {
        // Tier 1: ReWOO single-shot
        await this.executeReWOO(subtask, agentId, context, taskToolRouter, parentTask);
      } catch (reWOOError) {
        eventBus.emit(createEvent(
          'wave:agent_failed',
          `ReWOO failed for ${agentId}, falling back to ReAct: ${String(reWOOError)}`,
          { error: String(reWOOError), agentId, tier: 'rewoo' },
          agentId,
          subtask.id,
        ));

        // Tier 2: ReAct iterative loop
        const executor = new AgentExecutor(this.assembler, this.adapter, taskToolRouter);
        const result = await executor.execute(
          agentId, subtask, context, WaveExecutor.SUB_AGENT_MAX_ITERATIONS,
        );
        this.recordUsage(subtask, result.response, result.usage);
      }

      subtask.status = 'done';
      subtask.updatedAt = new Date().toISOString();

      eventBus.emit(createEvent(
        'wave:agent_completed',
        `Agent ${agentId} completed "${subtask.title}"`,
        { agentId, subtaskId: subtask.id, artifacts: subtask.artifacts?.length || 0 },
        agentId,
        subtask.id,
      ));
    } catch (error) {
      subtask.status = 'blocked';
      subtask.errorMessage = String(error);
      subtask.updatedAt = new Date().toISOString();

      eventBus.emit(createEvent(
        'wave:agent_failed',
        `Agent ${agentId} failed on "${subtask.title}": ${String(error)}`,
        { error: String(error), agentId, subtaskId: subtask.id },
        agentId,
        subtask.id,
      ));
    }
  }

  /**
   * ReWOO single-shot execution: one LLM call, no tools, artifacts parsed from output.
   */
  private async executeReWOO(
    subtask: Task,
    agentId: string,
    context: string,
    taskToolRouter: ToolRouter,
    parentTask: Task,
  ): Promise<void> {
    const prompt = this.assembler.assembleReWOO(agentId, subtask, context);

    const response = await this.adapter.chat({
      systemPrompt: prompt.systemPrompt,
      messages: [{ role: 'user', content: prompt.userMessage }],
      model: prompt.model,
      maxTokens: 21000,
    });

    // Extract text from response
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('');

    if (!text) {
      throw new Error('ReWOO response contained no text');
    }

    // Parse artifacts from delimited output
    const parsed = parseArtifacts(text);

    if (parsed.artifacts.length === 0) {
      throw new Error('ReWOO response contained no artifacts');
    }

    // Write each artifact via the task-scoped tool router
    for (const artifact of parsed.artifacts) {
      await taskToolRouter.execute('agentic_fs_write', {
        filename: artifact.filename,
        content: artifact.content,
        category: artifact.category,
      });
    }

    // Record usage and result
    subtask.result = parsed.summary.slice(0, 500);
    subtask.usage = {
      totalInputTokens: response.usage.inputTokens,
      totalOutputTokens: response.usage.outputTokens,
      iterations: 1,
      cacheReadInputTokens: response.usage.cacheReadInputTokens,
      cacheCreationInputTokens: response.usage.cacheCreationInputTokens,
    };
  }

  /**
   * Records usage from ReAct fallback execution onto the subtask.
   */
  private recordUsage(
    subtask: Task,
    response: string,
    usage: { totalInputTokens: number; totalOutputTokens: number; iterationDetails: unknown[] },
  ): void {
    subtask.result = response.slice(0, 500);
    subtask.usage = {
      totalInputTokens: usage.totalInputTokens,
      totalOutputTokens: usage.totalOutputTokens,
      iterations: usage.iterationDetails.length,
    };
  }

  /**
   * Groups subtasks into waves by executionOrder.
   * Subtasks without executionOrder default to wave 1.
   * Sorts waves by waveNumber, and subtasks within each wave by creation time.
   */
  private groupByWave(subtasks: Task[]): WaveGroup[] {
    const waveMap = new Map<number, Task[]>();

    for (const subtask of subtasks) {
      const wave = subtask.executionOrder || 1;
      const group = waveMap.get(wave) || [];
      group.push(subtask);
      waveMap.set(wave, group);
    }

    return Array.from(waveMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([waveNumber, tasks]) => ({
        waveNumber,
        subtasks: tasks.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      }));
  }
}
