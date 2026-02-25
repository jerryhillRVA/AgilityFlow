import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { getGitHubConnector } from './connectors/github-connector';
import { getSettingsService } from './settings-service';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { log } from './logger';
import type { Task, TaskArtifact } from '@/types/task';

const execFileAsync = promisify(execFile);

export interface ImplementationResult {
  success: boolean;
  branchName?: string;
  prUrl?: string;
  error?: string;
  logFile?: string;
}

const MAX_BUDGET_USD = 5;
/** 10 minutes — generous timeout for a full implementation cycle */
const EXEC_TIMEOUT_MS = 10 * 60 * 1000;
/** Directory for implementation audit logs (relative to project root) */
const LOG_DIR = join(process.cwd(), '.agility', 'logs');

/** Insert PAT into HTTPS GitHub URL for authentication */
function injectPATIntoUrl(repoUrl: string, pat: string): string {
  return repoUrl.replace('https://', `https://${pat}@`);
}

/**
 * Implements a task's design artifacts using the Claude Code CLI (`claude -p`).
 * Creates a branch, writes code, pushes, and opens a PR.
 *
 * Output is streamed in real-time via `--output-format stream-json`:
 * - Each NDJSON event is logged to the structured logger (visible in terminal)
 * - All events are tee'd to `.agility/logs/implement-{taskId}-{timestamp}.jsonl`
 * - Key events (assistant messages, tool use, result) are emitted to the SSE event bus
 *
 * Auth modes (controlled by `CLAUDE_CAUDE_LOCAL` env var):
 * - `true`  → local dev: uses OAuth / user subscription (ANTHROPIC_API_KEY stripped)
 * - `false` or unset → server: uses ANTHROPIC_API_KEY from environment
 *
 * Requires:
 * - `claude` CLI installed and on $PATH
 * - GitHub connector configured with a cloned repository
 */
export async function implementTask(task: Task): Promise<ImplementationResult> {
  const tag = 'implementer';

  // 1. Get clone directory from GitHub connector
  const cloneDir = await getGitHubConnector().getCloneDir();
  if (!cloneDir) {
    const error = 'GitHub connector is not configured or repository is not cloned. Configure it in Settings → Connectors.';
    log.error(tag, error);
    return { success: false, error };
  }

  log.info(tag, `Starting implementation for task "${task.title}" in ${cloneDir}`);

  eventBus.emit(createEvent(
    'implementation:started',
    `Implementation started for "${task.title}"`,
    { taskId: task.id },
    undefined,
    task.id,
  ));

  try {
    // 2. Fetch design artifacts
    const designArtifacts = (task.artifacts || []).filter(a => a.category === 'design');
    const verificationArtifacts = (task.artifacts || []).filter(a => a.category === 'verification');
    const requirementsArtifacts = (task.artifacts || []).filter(a => a.category === 'requirements');

    const artifactContents = await fetchArtifactContents([
      ...requirementsArtifacts,
      ...designArtifacts,
      ...verificationArtifacts,
    ]);

    if (artifactContents.length === 0) {
      const error = 'No artifact contents could be fetched';
      log.error(tag, error);
      return { success: false, error };
    }

    // 3. Build the prompt
    const branchName = `agility/${task.id}`;
    const prompt = buildImplementationPrompt(task, artifactContents, branchName);

    log.info(tag, `Invoking Claude Code CLI with $${MAX_BUDGET_USD} budget`, {
      taskId: task.id,
      artifactCount: artifactContents.length,
      cloneDir,
    });

    // 4. Run Claude Code CLI with streaming output
    const result = await runClaudeCodeCLI(prompt, cloneDir, task.id);

    // 5. Extract PR URL from the collected output
    const prUrl = extractPrUrl(result.allText);

    if (prUrl) {
      log.info(tag, `Implementation complete — PR created: ${prUrl}`, { taskId: task.id });

      eventBus.emit(createEvent(
        'implementation:completed',
        `Implementation completed for "${task.title}" — PR: ${prUrl}`,
        { taskId: task.id, prUrl, branchName, logFile: result.logFile },
        undefined,
        task.id,
      ));

      return { success: true, branchName, prUrl, logFile: result.logFile };
    }

    // No PR URL found — check if output indicates errors
    const allText = result.allText;
    if (allText.toLowerCase().includes('error') || allText.toLowerCase().includes('failed')) {
      const error = `Claude Code completed but encountered issues: ${allText.slice(-500)}`;
      log.warn(tag, error, { taskId: task.id });
      return { success: false, branchName, error, logFile: result.logFile };
    }

    // Finished without error but no PR
    log.warn(tag, 'Claude Code finished but no PR URL was detected in output', { taskId: task.id });
    return {
      success: false,
      branchName,
      error: 'Implementation completed but no PR URL was found in the output. Check the branch manually.',
      logFile: result.logFile,
    };

  } catch (err) {
    const error = `Implementation failed: ${String(err)}`;
    log.error(tag, error, { taskId: task.id });

    eventBus.emit(createEvent(
      'implementation:failed',
      `Implementation failed for "${task.title}": ${String(err)}`,
      { taskId: task.id, error: String(err) },
      undefined,
      task.id,
    ));

    return { success: false, error };
  }
}

interface CLIResult {
  allText: string;
  logFile: string;
  exitCode: number | null;
}

/**
 * Run Claude Code CLI with GitHub authentication.
 *
 * Sets up auth and repo state before spawning:
 * 1. Retrieves decrypted GitHub PAT from settings
 * 2. Temporarily injects PAT into the git remote URL for `git push`
 * 3. Fetches latest and resets to origin/{branch} so we always branch from latest
 * 4. Sets GH_TOKEN env var for `gh pr create` inside Claude Code
 * 5. Spawns Claude Code CLI via `spawnClaudeCode()`
 * 6. Cleans up: resets git remote URL to strip PAT (guaranteed via `finally`)
 */
async function runClaudeCodeCLI(prompt: string, cwd: string, taskId: string): Promise<CLIResult> {
  // --- Auth setup ---
  const settingsService = getSettingsService();
  const pat = await settingsService.getDecryptedPAT();
  const settings = await settingsService.load();
  const repoUrl = settings.connectors.github.repoUrl;

  if (!pat) {
    throw new Error(
      'GitHub PAT is not configured. Set it in Settings → Connectors before running implementation.'
    );
  }

  if (!repoUrl) {
    throw new Error(
      'GitHub repository URL is not configured. Set it in Settings → Connectors.'
    );
  }

  // Inject PAT into origin remote so `git push` and `git fetch` work
  const authedUrl = injectPATIntoUrl(repoUrl, pat);
  await execFileAsync('git', ['-C', cwd, 'remote', 'set-url', 'origin', authedUrl], {
    timeout: 10000,
  });
  log.info('implementer', 'Injected PAT into git remote for push auth');

  // --- Prepare repo: always start from latest origin branch ---
  const branch = settings.connectors.github.branch || 'main';
  await execFileAsync('git', ['-C', cwd, 'fetch', 'origin'], { timeout: 60000 });
  await execFileAsync('git', ['-C', cwd, 'checkout', branch], { timeout: 10000 });
  await execFileAsync('git', ['-C', cwd, 'reset', '--hard', `origin/${branch}`], { timeout: 10000 });
  log.info('implementer', `Repo prepared: checked out ${branch} and reset to origin/${branch}`);

  try {
    return await spawnClaudeCode(prompt, cwd, taskId, pat);
  } finally {
    // --- Auth cleanup: ALWAYS remove PAT from remote URL ---
    try {
      await execFileAsync('git', ['-C', cwd, 'remote', 'set-url', 'origin', repoUrl], {
        timeout: 10000,
      });
      log.info('implementer', 'Cleaned up: removed PAT from git remote URL');
    } catch (cleanupErr) {
      log.error('implementer', `Failed to clean PAT from remote URL: ${String(cleanupErr)}`);
    }
  }
}

/**
 * Spawn Claude Code CLI in non-interactive print mode with streaming NDJSON output.
 *
 * - Uses `--output-format stream-json` for real-time event streaming
 * - Uses `--model opusplan` (Opus 4.6 for planning, Sonnet for coding)
 * - Each NDJSON line is parsed and:
 *   1. Written to the audit log file (.agility/logs/implement-{taskId}-{ts}.jsonl)
 *   2. Logged to the structured logger (terminal visibility)
 *   3. Key events emitted to the SSE event bus (UI activity feed)
 * - The prompt is fed via stdin to avoid shell argument length limits.
 * - GH_TOKEN is set in child env so `gh pr create` works.
 *
 * Auth: When CLAUDE_CAUDE_LOCAL=true (local dev), ANTHROPIC_API_KEY is stripped
 * from the child env so Claude Code uses OAuth / the user's subscription.
 * On a server (CLAUDE_CAUDE_LOCAL unset or false), ANTHROPIC_API_KEY passes through.
 */
function spawnClaudeCode(prompt: string, cwd: string, taskId: string, pat: string): Promise<CLIResult> {
  return new Promise((resolve, reject) => {
    // Ensure log directory exists
    mkdirSync(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(LOG_DIR, `implement-${taskId}-${timestamp}.jsonl`);
    const logStream = createWriteStream(logFile, { flags: 'a' });

    log.info('implementer', `Audit log: ${logFile}`);

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--model', 'claude-sonnet-4-6',
      '--max-budget-usd', String(MAX_BUDGET_USD),
      '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch',
      '--no-session-persistence',
      '--verbose',
    ];

    // Build child process env based on auth mode
    const isLocal = process.env.CLAUDE_CAUDE_LOCAL === 'true';
    const childEnv = { ...process.env };
    if (isLocal) {
      // Local dev: strip API key so Claude Code uses OAuth / subscription
      delete childEnv.ANTHROPIC_API_KEY;
      delete childEnv.ANTHROPIC_BASE_URL;
      log.info('implementer', 'Local mode: using OAuth (ANTHROPIC_API_KEY stripped from child env)');
    } else {
      log.info('implementer', 'Server mode: using ANTHROPIC_API_KEY for Claude Code CLI');
    }

    // Set GH_TOKEN so `gh pr create` works inside Claude Code
    childEnv.GH_TOKEN = pat;
    log.info('implementer', 'Set GH_TOKEN in child env for gh CLI auth');

    log.debug('implementer', `Running: claude ${args.join(' ')} (cwd: ${cwd}, auth: ${isLocal ? 'oauth' : 'api-key'})`);

    const child = spawn('claude', args, {
      cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Timeout guard
    const timer = setTimeout(() => {
      log.warn('implementer', `Claude Code timed out after ${EXEC_TIMEOUT_MS / 1000}s — killing process`);
      child.kill('SIGTERM');
    }, EXEC_TIMEOUT_MS);

    // Collect all text output (for PR URL extraction)
    let allText = '';
    let stderrText = '';
    let lineBuffer = '';

    // Feed prompt via stdin
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    // Process stdout stream-json (NDJSON) line by line
    child.stdout.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last incomplete line in the buffer
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Write raw NDJSON line to audit log
        logStream.write(line + '\n');

        // Parse and process the event
        try {
          const event = JSON.parse(line);
          processStreamEvent(event, taskId);

          // Collect text for PR URL extraction
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                allText += block.text + '\n';
              }
            }
          }
          if (event.type === 'result' && event.result) {
            allText += event.result + '\n';
          }
        } catch {
          // Not valid JSON — log as raw text (e.g., verbose output)
          log.debug('implementer', `[raw] ${line.slice(0, 200)}`);
          allText += line + '\n';
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
      log.debug('implementer', `[stderr] ${chunk.toString().trim().slice(0, 300)}`);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      // Flush remaining buffer
      if (lineBuffer.trim()) {
        logStream.write(lineBuffer + '\n');
        allText += lineBuffer + '\n';
      }
      logStream.end();

      log.info('implementer', `Claude Code exited with code ${code}`, { logFile });

      if (code !== 0 && !allText) {
        reject(new Error(
          `Claude Code CLI exited with code ${code}${stderrText ? `\nstderr: ${stderrText.slice(0, 500)}` : ''}`
        ));
        return;
      }

      // Even if exit code is non-zero, resolve with output so we can check for PR URL
      resolve({ allText, logFile, exitCode: code });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logStream.end();
      reject(new Error(`Failed to spawn Claude Code CLI: ${err.message}`));
    });
  });
}

/**
 * Process a single stream-json event from Claude Code CLI.
 * Logs to the structured logger and emits key events to the SSE bus.
 */
function processStreamEvent(event: Record<string, unknown>, taskId: string): void {
  const type = event.type as string;

  switch (type) {
    case 'system': {
      const subtype = event.subtype as string;
      if (subtype === 'init') {
        log.info('implementer', `Claude Code initialized (model: ${event.model}, tools: ${(event.tools as string[])?.length || 0})`);
      } else {
        log.debug('implementer', `[system:${subtype}]`);
      }
      break;
    }

    case 'assistant': {
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            const text = (block.text as string).slice(0, 300);
            log.info('implementer', `[assistant] ${text}`);
            eventBus.emit(createEvent(
              'agent:thinking',
              `Implementation agent: ${text.slice(0, 150)}`,
              { taskId },
              'implementer',
              taskId,
            ));
          } else if (block.type === 'tool_use') {
            const toolName = block.name as string;
            const input = block.input as Record<string, unknown> | undefined;
            const summary = input?.command || input?.file_path || input?.pattern || input?.query || '';
            log.info('implementer', `[tool_use] ${toolName}: ${String(summary).slice(0, 150)}`);
            eventBus.emit(createEvent(
              'agent:tool_call',
              `Implementation agent called ${toolName}`,
              { taskId, tool: toolName, input: String(summary).slice(0, 200) },
              'implementer',
              taskId,
            ));
          }
        }
      }
      break;
    }

    case 'result': {
      const subtype = event.subtype as string;
      const costUsd = event.total_cost_usd as number | undefined;
      const numTurns = event.num_turns as number | undefined;
      log.info('implementer', `[result] ${subtype} — turns: ${numTurns}, cost: $${costUsd?.toFixed(2) || '?'}`);
      eventBus.emit(createEvent(
        'agent:completed',
        `Implementation agent finished (${subtype}, ${numTurns} turns, $${costUsd?.toFixed(2) || '?'})`,
        { taskId, subtype, costUsd, numTurns },
        'implementer',
        taskId,
      ));
      break;
    }

    default:
      log.debug('implementer', `[${type}] ${JSON.stringify(event).slice(0, 150)}`);
  }
}

/** Fetch content for a list of artifacts from Agentic FS */
async function fetchArtifactContents(
  artifacts: TaskArtifact[],
): Promise<{ filename: string; category: string; content: string }[]> {
  const fs = getAgenticFSClient();
  const results: { filename: string; category: string; content: string }[] = [];

  for (const artifact of artifacts) {
    try {
      const content = await fs.downloadFile(artifact.fileId);
      results.push({
        filename: artifact.filename,
        category: artifact.category,
        content,
      });
    } catch (err) {
      log.warn('implementer', `Failed to fetch artifact "${artifact.filename}": ${String(err)}`);
    }
  }

  return results;
}

/** Build the implementation prompt for Claude Code CLI */
function buildImplementationPrompt(
  task: Task,
  artifacts: { filename: string; category: string; content: string }[],
  branchName: string,
): string {
  const sections: string[] = [];

  sections.push(`# Implementation Task: ${task.title}`);
  sections.push(`\n## Description\n${task.description}`);

  // Group artifacts by category
  const requirements = artifacts.filter(a => a.category === 'requirements');
  const designs = artifacts.filter(a => a.category === 'design');
  const reviews = artifacts.filter(a => a.category === 'verification');

  if (requirements.length > 0) {
    sections.push('\n## Requirements');
    for (const a of requirements) {
      sections.push(`\n### ${a.filename}\n${a.content}`);
    }
  }

  if (designs.length > 0) {
    sections.push('\n## Design Specifications');
    for (const a of designs) {
      sections.push(`\n### ${a.filename}\n${a.content}`);
    }
  }

  if (reviews.length > 0) {
    sections.push('\n## Design Review');
    for (const a of reviews) {
      sections.push(`\n### ${a.filename}\n${a.content}`);
    }
  }

  sections.push(`
## Instructions

You are implementing the above designs in this codebase. Follow these steps:

1. **Explore the codebase** first — search for existing patterns, conventions, and related code using Glob, Grep, and Read tools. Understand the project structure before writing any code.

2. **Implement the designs** faithfully. The design specifications are your source of truth for what to build. Follow existing project conventions (TypeScript strict mode, Next.js App Router, Tailwind CSS, etc.).

3. **Create a new branch and commit:**
   - Create branch: \`git checkout -b ${branchName}\`
   - Stage your changes: \`git add <files>\`
   - Commit with a descriptive message
   - Push: \`git push -u origin ${branchName}\`

4. **Create a Pull Request:**
   - Use: \`gh pr create --title "<concise title>" --body "<description of changes>"\`
   - The PR title should reference the task: "${task.title}"
   - The PR body should summarize what was implemented

5. **Output the PR URL** as the very last line of your response so it can be captured.

Important:
- Do NOT skip exploring the codebase. Understanding existing patterns is critical.
- If you encounter issues, use WebSearch/WebFetch to look up documentation or solutions.
- Keep changes focused — only implement what the designs specify.
- Ensure the code compiles without TypeScript errors.
`);

  return sections.join('\n');
}

/** Extract a GitHub PR URL from Claude Code CLI output */
function extractPrUrl(output: string): string | null {
  // Search from the end of output (PR URL is typically at the end)
  const matches = output.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/g);
  if (matches && matches.length > 0) {
    // Return the last match (most likely the final PR URL)
    return matches[matches.length - 1];
  }
  return null;
}
