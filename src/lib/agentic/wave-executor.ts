import type { ModelAdapter } from './adapters/model-adapter';
import type { PromptAssembler } from './prompt-assembler';
import type { ToolRouter } from './tools/tool-router';
import type { Task } from '@/types/task';
import { AgentExecutor } from './executor';
import { buildAgentContext } from './context-builder';
import { parseArtifacts } from './artifact-parser';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { log } from './logger';

/** Agents that are expected to produce implementation artifacts */
const CODING_AGENTS = ['backend-developer', 'frontend-developer'];

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
  /** Role-based iteration budget for the ReAct fallback tier.
   *  Coding agents need more headroom: ask(1) + read/search(1-2) + write artifacts(1-2) + max_tokens retry(1-2). */
  private static readonly ITERATION_BUDGET: Record<string, number> = {
    'backend-developer': 10,
    'frontend-developer': 10,
    'code-reviewer': 8,
    'qa-analyst': 8,
    'technical-writer': 8,
  };
  private static readonly DEFAULT_ITERATIONS = 8;

  constructor(
    private assembler: PromptAssembler,
    private adapter: ModelAdapter,
    private toolRouter: ToolRouter,
  ) {}

  private getIterationBudget(agentId: string): number {
    return WaveExecutor.ITERATION_BUDGET[agentId] ?? WaveExecutor.DEFAULT_ITERATIONS;
  }

  /**
   * Execute all subtasks grouped by executionOrder.
   * Each wave's agents run sequentially so later agents see prior artifacts.
   */
  async executeWaves(
    parentTask: Task,
    subtasks: Task[],
    createTaskToolRouter: (taskId: string) => ToolRouter,
    onSubtaskUpdate?: (subtask: Task) => void,
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
        await this.executeSubtask(parentTask, subtask, taskToolRouter, onSubtaskUpdate);
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
    onSubtaskUpdate?: (subtask: Task) => void,
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
    onSubtaskUpdate?.(subtask);

    try {
      // Build pre-fetched context from parent + prior artifacts
      const priorArtifacts = parentTask.artifacts || [];
      log.info('wave-executor', `Building context for ${agentId} with ${priorArtifacts.length} prior artifact(s)`, { subtaskId: subtask.id });
      const context = await buildAgentContext(parentTask, agentId, priorArtifacts);

      try {
        // Tier 1: ReWOO single-shot
        log.info('wave-executor', `ReWOO starting for ${agentId} on "${subtask.title}"`, { subtaskId: subtask.id });
        await this.executeReWOO(subtask, agentId, context, taskToolRouter, parentTask);
      } catch (reWOOError) {
        log.warn('wave-executor', `ReWOO failed for ${agentId}: ${String(reWOOError)}`, { subtaskId: subtask.id });
        eventBus.emit(createEvent(
          'wave:agent_failed',
          `ReWOO failed for ${agentId}, falling back to ReAct: ${String(reWOOError)}`,
          { error: String(reWOOError), agentId, tier: 'rewoo' },
          agentId,
          subtask.id,
        ));

        // Tier 2: ReAct iterative loop
        const maxIter = this.getIterationBudget(agentId);
        log.info('wave-executor', `Falling back to ReAct for ${agentId} with ${maxIter} iterations`, { subtaskId: subtask.id });
        const executor = new AgentExecutor(this.assembler, this.adapter, taskToolRouter);
        const result = await executor.execute(
          agentId, subtask, context, maxIter,
        );
        this.recordUsage(subtask, result.response, result.usage);
      }

      // Validate artifact output before marking done
      const artifactCount = subtask.artifacts?.length || 0;

      if (CODING_AGENTS.includes(agentId) && artifactCount === 0) {
        log.warn('wave-executor', `Coding agent "${agentId}" completed with ZERO artifacts for "${subtask.title}"`, {
          subtaskId: subtask.id,
          agentId,
        });

        subtask.status = 'blocked';
        subtask.errorMessage = `Agent ${agentId} completed execution but produced no artifacts. Check Agentic FS connectivity and agent output.`;
        subtask.updatedAt = new Date().toISOString();
        onSubtaskUpdate?.(subtask);

        eventBus.emit(createEvent(
          'wave:agent_failed',
          `Agent ${agentId} completed "${subtask.title}" but produced ZERO artifacts — marked as blocked`,
          { agentId, subtaskId: subtask.id, artifacts: 0 },
          agentId,
          subtask.id,
        ));
      } else {
        subtask.status = 'done';
        subtask.updatedAt = new Date().toISOString();
        onSubtaskUpdate?.(subtask);

        log.info('wave-executor', `Agent ${agentId} completed "${subtask.title}" with ${artifactCount} artifact(s)`, {
          subtaskId: subtask.id,
          agentId,
          artifactCount,
        });

        eventBus.emit(createEvent(
          'wave:agent_completed',
          `Agent ${agentId} completed "${subtask.title}"`,
          { agentId, subtaskId: subtask.id, artifacts: artifactCount },
          agentId,
          subtask.id,
        ));
      }
    } catch (error) {
      subtask.status = 'blocked';
      subtask.errorMessage = String(error);
      subtask.updatedAt = new Date().toISOString();
      onSubtaskUpdate?.(subtask);

      log.error('wave-executor', `Agent ${agentId} failed on "${subtask.title}": ${String(error)}`, { subtaskId: subtask.id });
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

    log.info('wave-executor', `ReWOO parsed ${parsed.artifacts.length} artifact(s) from ${agentId}`, {
      subtaskId: subtask.id,
      artifacts: parsed.artifacts.map(a => a.filename),
    });

    if (parsed.artifacts.length === 0) {
      throw new Error('ReWOO response contained no artifacts');
    }

    // Write each artifact via the task-scoped tool router
    for (const artifact of parsed.artifacts) {
      log.debug('wave-executor', `ReWOO writing artifact "${artifact.filename}" via taskToolRouter`, { subtaskId: subtask.id, category: artifact.category });
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
