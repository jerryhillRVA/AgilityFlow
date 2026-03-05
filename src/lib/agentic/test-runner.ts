import { spawn } from 'child_process';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { eventBus } from './events/emitter';
import { createEvent } from './events/types';
import { log } from './logger';
import type { Task, TaskArtifact } from '@/types/task';

export interface TestResult {
  success: boolean;
  report?: string;
  error?: string;
  logFile?: string;
  passedCount?: number;
  failedCount?: number;
}

const MAX_BUDGET_USD = 10;
/** 20 minutes — browser automation via AppleScript is slower than file editing */
const EXEC_TIMEOUT_MS = 20 * 60 * 1000;
/** Directory for test execution audit logs (relative to project root) */
const LOG_DIR = join(process.cwd(), '.agility', 'logs');

const TAG = 'test-runner';

/**
 * Run test cases against a live environment using Claude Code CLI with Chrome MCP browser tools.
 *
 * Fetches verification artifacts (test cases) from Agentic FS, builds a test prompt,
 * and spawns Claude Code CLI with browser automation tools to execute the tests.
 *
 * Output is streamed in real-time via `--output-format stream-json`:
 * - Each NDJSON event is logged to the structured logger (visible in terminal)
 * - All events are tee'd to `.agility/logs/test-{taskId}-{timestamp}.jsonl`
 * - Key events are emitted to the SSE event bus for the activity feed
 */
export async function runTests(task: Task, testEnvironmentUrl: string): Promise<TestResult> {
  log.info(TAG, `Starting test execution for "${task.title}" against ${testEnvironmentUrl}`);

  eventBus.emit(createEvent(
    'test:started',
    `Test execution started for "${task.title}"`,
    { taskId: task.id, testEnvironmentUrl },
    undefined,
    task.id,
  ));

  try {
    // 1. Fetch verification + design artifacts
    const verificationArtifacts = (task.artifacts || []).filter(a => a.category === 'verification');
    const designArtifacts = (task.artifacts || []).filter(a => a.category === 'design');

    const artifactContents = await fetchArtifactContents([
      ...verificationArtifacts,
      ...designArtifacts,
    ]);

    if (artifactContents.length === 0) {
      const error = 'No artifact contents could be fetched';
      log.error(TAG, error);
      return { success: false, error };
    }

    // 2. Build the test prompt
    const prompt = buildTestPrompt(task, artifactContents, testEnvironmentUrl);

    log.info(TAG, `Invoking Claude Code CLI with $${MAX_BUDGET_USD} budget`, {
      taskId: task.id,
      artifactCount: artifactContents.length,
      testEnvironmentUrl,
    });

    // 3. Run Claude Code CLI with Chrome MCP tools
    const result = await spawnClaudeCode(prompt, task.id);

    // 4. Extract test report from output
    const parsed = extractTestReport(result.allText);

    if (parsed) {
      const allPassed = parsed.failedCount === 0;
      log.info(TAG, `Tests ${allPassed ? 'passed' : 'failed'} for "${task.title}" (${parsed.passedCount}/${parsed.passedCount + parsed.failedCount})`, {
        taskId: task.id,
      });

      eventBus.emit(createEvent(
        allPassed ? 'test:completed' : 'test:failed',
        `Tests ${allPassed ? 'passed' : 'failed'} for "${task.title}" (${parsed.passedCount} passed, ${parsed.failedCount} failed)`,
        { taskId: task.id, passedCount: parsed.passedCount, failedCount: parsed.failedCount, logFile: result.logFile },
        undefined,
        task.id,
      ));

      return {
        success: allPassed,
        report: parsed.report,
        logFile: result.logFile,
        passedCount: parsed.passedCount,
        failedCount: parsed.failedCount,
        error: allPassed ? undefined : `${parsed.failedCount} test(s) failed`,
      };
    }

    // No structured report found — try to salvage individual PASS/FAIL lines from raw output
    log.warn(TAG, 'No structured test report found in output — attempting fallback parsing', { taskId: task.id });

    const fallback = extractFallbackResults(result.allText);
    if (fallback) {
      const allPassed = fallback.failedCount === 0 && fallback.passedCount > 0;
      return {
        success: allPassed,
        report: fallback.report,
        logFile: result.logFile,
        passedCount: fallback.passedCount,
        failedCount: fallback.failedCount,
        error: allPassed
          ? undefined
          : fallback.failedCount > 0
            ? `${fallback.failedCount} test(s) failed`
            : 'Test execution ended before completing — no results captured.',
      };
    }

    return {
      success: false,
      report: result.allText.slice(-2000),
      error: 'Test execution completed but no test results could be extracted from the output.',
      logFile: result.logFile,
    };

  } catch (err) {
    const error = `Test execution failed: ${String(err)}`;
    log.error(TAG, error, { taskId: task.id });

    eventBus.emit(createEvent(
      'test:failed',
      `Test execution failed for "${task.title}": ${String(err)}`,
      { taskId: task.id, error: String(err) },
      undefined,
      task.id,
    ));

    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// Claude Code CLI spawn
// ---------------------------------------------------------------------------

interface CLIResult {
  allText: string;
  logFile: string;
  exitCode: number | null;
}

/**
 * Spawn Claude Code CLI with Chrome MCP browser automation tools.
 * No git auth needed — tests only use the browser, not the filesystem.
 */
function spawnClaudeCode(prompt: string, taskId: string): Promise<CLIResult> {
  return new Promise((resolve, reject) => {
    mkdirSync(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(LOG_DIR, `test-${taskId}-${timestamp}.jsonl`);
    const logStream = createWriteStream(logFile, { flags: 'a' });

    log.info(TAG, `Audit log: ${logFile}`);

    const allowedTools = [
      'mcp__chrome-control__open_url',
      'mcp__chrome-control__get_current_tab',
      'mcp__chrome-control__list_tabs',
      'mcp__chrome-control__switch_to_tab',
      'mcp__chrome-control__reload_tab',
      'mcp__chrome-control__execute_javascript',
      'mcp__chrome-control__get_page_content',
    ].join(',');

    // Build MCP config for the chrome-control DXT server
    const chromeControlServerPath = join(
      homedir(),
      'Library', 'Application Support', 'Claude', 'Claude Extensions',
      'ant.dir.ant.anthropic.chrome-control', 'server', 'index.js',
    );

    if (!existsSync(chromeControlServerPath)) {
      throw new Error(
        `Chrome Control MCP server not found at: ${chromeControlServerPath}. ` +
        'Please ensure the "Control Chrome" extension is installed in Claude Desktop.'
      );
    }

    const mcpConfig = JSON.stringify({
      mcpServers: {
        'chrome-control': {
          command: 'node',
          args: [chromeControlServerPath],
        },
      },
    });

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--model', 'claude-sonnet-4-6',
      '--max-budget-usd', String(MAX_BUDGET_USD),
      '--allowedTools', allowedTools,
      '--mcp-config', mcpConfig,
      '--no-session-persistence',
      '--verbose',
    ];

    // Build child process env based on auth mode
    const isLocal = process.env.CLAUDE_CAUDE_LOCAL === 'true';
    const childEnv = { ...process.env };
    // Always strip CLAUDECODE to avoid nested-session detection
    delete childEnv.CLAUDECODE;
    if (isLocal) {
      delete childEnv.ANTHROPIC_API_KEY;
      delete childEnv.ANTHROPIC_BASE_URL;
      log.info(TAG, 'Local mode: using OAuth (ANTHROPIC_API_KEY stripped from child env)');
    } else {
      log.info(TAG, 'Server mode: using ANTHROPIC_API_KEY for Claude Code CLI');
    }

    log.debug(TAG, `Running: claude ${args.join(' ')} (cwd: ${process.cwd()}, auth: ${isLocal ? 'oauth' : 'api-key'})`);

    const child = spawn('claude', args, {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Timeout guard
    const timer = setTimeout(() => {
      log.warn(TAG, `Claude Code timed out after ${EXEC_TIMEOUT_MS / 1000}s — killing process`);
      child.kill('SIGTERM');
    }, EXEC_TIMEOUT_MS);

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
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        logStream.write(line + '\n');

        try {
          const event = JSON.parse(line);
          processStreamEvent(event, taskId);

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
          log.debug(TAG, `[raw] ${line.slice(0, 200)}`);
          allText += line + '\n';
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
      log.debug(TAG, `[stderr] ${chunk.toString().trim().slice(0, 300)}`);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (lineBuffer.trim()) {
        logStream.write(lineBuffer + '\n');
        allText += lineBuffer + '\n';
      }
      logStream.end();

      log.info(TAG, `Claude Code exited with code ${code}`, { logFile });

      if (code !== 0 && !allText) {
        reject(new Error(
          `Claude Code CLI exited with code ${code}${stderrText ? `\nstderr: ${stderrText.slice(0, 500)}` : ''}`
        ));
        return;
      }

      resolve({ allText, logFile, exitCode: code });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logStream.end();
      reject(new Error(`Failed to spawn Claude Code CLI: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Stream event processing
// ---------------------------------------------------------------------------

function processStreamEvent(event: Record<string, unknown>, taskId: string): void {
  const type = event.type as string;

  switch (type) {
    case 'system': {
      const subtype = event.subtype as string;
      if (subtype === 'init') {
        log.info(TAG, `Claude Code initialized (model: ${event.model}, tools: ${(event.tools as string[])?.length || 0})`);
      } else {
        log.debug(TAG, `[system:${subtype}]`);
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
            log.info(TAG, `[assistant] ${text}`);
            eventBus.emit(createEvent(
              'agent:thinking',
              `Test runner: ${text.slice(0, 150)}`,
              { taskId },
              TAG,
              taskId,
            ));
          } else if (block.type === 'tool_use') {
            const toolName = block.name as string;
            const input = block.input as Record<string, unknown> | undefined;
            const summary = input?.url || input?.query || input?.ref || '';
            log.info(TAG, `[tool_use] ${toolName}: ${String(summary).slice(0, 150)}`);
            eventBus.emit(createEvent(
              'agent:tool_call',
              `Test runner called ${toolName}`,
              { taskId, tool: toolName, input: String(summary).slice(0, 200) },
              TAG,
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
      log.info(TAG, `[result] ${subtype} — turns: ${numTurns}, cost: $${costUsd?.toFixed(2) || '?'}`);
      eventBus.emit(createEvent(
        'agent:completed',
        `Test runner finished (${subtype}, ${numTurns} turns, $${costUsd?.toFixed(2) || '?'})`,
        { taskId, subtype, costUsd, numTurns },
        TAG,
        taskId,
      ));
      break;
    }

    default:
      log.debug(TAG, `[${type}] ${JSON.stringify(event).slice(0, 150)}`);
  }
}

// ---------------------------------------------------------------------------
// Artifact fetching
// ---------------------------------------------------------------------------

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
      log.warn(TAG, `Failed to fetch artifact "${artifact.filename}": ${String(err)}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildTestPrompt(
  task: Task,
  artifacts: { filename: string; category: string; content: string }[],
  testEnvironmentUrl: string,
): string {
  const sections: string[] = [];

  sections.push(`# Test Execution: ${task.title}`);
  sections.push(`\n## Test Environment\nBase URL: ${testEnvironmentUrl}`);
  sections.push(`\n## Task Description\n${task.description}`);

  const testCases = artifacts.filter(a => a.category === 'verification');
  if (testCases.length > 0) {
    sections.push('\n## Test Cases');
    for (const a of testCases) {
      sections.push(`\n### ${a.filename}\n${a.content}`);
    }
  }

  const designs = artifacts.filter(a => a.category === 'design');
  if (designs.length > 0) {
    sections.push('\n## Design Specifications (for reference)');
    for (const a of designs) {
      sections.push(`\n### ${a.filename}\n${a.content}`);
    }
  }

  sections.push(`
## Instructions

You are a QA tester executing the test cases defined above against a live web application using Chrome browser automation via MCP tools. Follow these instructions precisely:

### Available Tools
You have the following Chrome control tools (AppleScript-based):

- \`mcp__chrome-control__open_url\` — Navigate to a URL in Chrome (params: \`url\`, \`new_tab\`)
- \`mcp__chrome-control__get_current_tab\` — Get current tab info (URL, title, id)
- \`mcp__chrome-control__list_tabs\` — List all open tabs
- \`mcp__chrome-control__switch_to_tab\` — Switch to a specific tab by ID (param: \`tab_id\`)
- \`mcp__chrome-control__reload_tab\` — Reload a tab (param: \`tab_id\`)
- \`mcp__chrome-control__execute_javascript\` — Execute JavaScript in a tab (params: \`code\`, \`tab_id\`)
- \`mcp__chrome-control__get_page_content\` — Get text content of a page (param: \`tab_id\`)

### Setup
1. First, call \`mcp__chrome-control__open_url\` to navigate to the test environment URL: ${testEnvironmentUrl}
2. Wait a moment for the page to load, then verify with \`mcp__chrome-control__get_page_content\`.

### Test Execution Patterns

**Navigate to a page:**
\`\`\`
mcp__chrome-control__open_url({ url: "${testEnvironmentUrl}/some-path", new_tab: false })
\`\`\`

**Read page text content:**
\`\`\`
mcp__chrome-control__get_page_content({})
\`\`\`

**Check if an element exists or is visible:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "!!document.querySelector('.my-element')" })
\`\`\`

**Get element text:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "document.querySelector('.my-element')?.textContent" })
\`\`\`

**Click a button or link:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "document.querySelector('button.submit')?.click()" })
\`\`\`

**Fill a form input:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "const el = document.querySelector('input[name=email]'); if(el) { el.value = 'test@test.com'; el.dispatchEvent(new Event('input', {bubbles:true})); }" })
\`\`\`

**Check form validation:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "document.querySelector('.error-message')?.textContent || 'no error'" })
\`\`\`

**Get number of items in a list:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "document.querySelectorAll('.list-item').length" })
\`\`\`

**Check for console errors (by injecting a listener):**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "window.__testErrors = window.__testErrors || []; window.addEventListener('error', e => window.__testErrors.push(e.message)); 'listener installed'" })
// Later, check collected errors:
mcp__chrome-control__execute_javascript({ code: "JSON.stringify(window.__testErrors || [])" })
\`\`\`

**Wait for dynamic content:**
\`\`\`
mcp__chrome-control__execute_javascript({ code: "new Promise(resolve => setTimeout(() => resolve(document.querySelector('.loaded')?.textContent || 'not loaded'), 2000))" })
\`\`\`

### CRITICAL SAFETY RULES
- You are testing a LIVE application with REAL data. NEVER click buttons that change task status (e.g., "Mark Done", "Request Changes", "Move to…", "Delete", "Archive"). These are destructive actions that modify real data.
- For status transition tests, ONLY verify the buttons EXIST and have the correct labels — do NOT click them.
- Do NOT submit forms that create, update, or delete records unless the test plan explicitly requires it AND the action is non-destructive (e.g., a search form is fine, a delete confirmation is NOT).
- Do NOT navigate away from the test environment URL domain.

### Test Execution
For each test case in the test plan above:

1. **Navigate** to the relevant page using \`open_url\`.
2. **Read the page** using \`get_page_content\` or \`execute_javascript\` to verify page structure and content.
3. **Interact** with the page using \`execute_javascript\` — click UI elements to open panels, expand sections, fill search fields, etc. But NEVER click destructive action buttons (status changes, delete, submit).
4. **Verify** expected outcomes by reading DOM state with \`execute_javascript\`.
5. **Check for errors** using injected error listeners.
6. Continue to the next test case, regardless of pass/fail.

### Report Format
After executing ALL test cases, output a structured test report in this exact format:

# Test Execution Report

## Summary
- **Total Tests:** <number>
- **Passed:** <number>
- **Failed:** <number>
- **Status:** PASSED | FAILED

## Test Results

### <Test Case 1 Name>
- **Status:** PASS | FAIL
- **Steps Executed:** <brief description>
- **Result:** <what was observed>
- **Notes:** <any additional observations>

### <Test Case 2 Name>
- **Status:** PASS | FAIL
- **Steps Executed:** <brief description>
- **Result:** <what was observed>
- **Notes:** <any additional observations>

... (repeat for all test cases)

## Issues Found
<List any bugs, inconsistencies, or unexpected behaviors discovered during testing>

Important:
- Execute EVERY test case in the test plan. Do not skip any.
- If a test fails, continue executing remaining tests (do not stop on first failure).
- Be precise about what passed and what failed — the report must be accurate.
- The test report is the LAST thing you output.
- Use ONLY the mcp__chrome-control__* tools listed above. Do NOT use Bash, Read, or any other tools.
`);

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Report extraction
// ---------------------------------------------------------------------------

function extractTestReport(output: string): { report: string; passedCount: number; failedCount: number } | null {
  const reportMatch = output.match(/# Test Execution Report[\s\S]*/);
  if (!reportMatch) return null;

  const report = reportMatch[0].trim();

  const passedMatch = report.match(/\*\*Passed:\*\*\s*(\d+)/);
  const failedMatch = report.match(/\*\*Failed:\*\*\s*(\d+)/);
  const blockedMatch = report.match(/\*\*Blocked:\*\*\s*(\d+)/);

  const passedCount = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const blockedCount = blockedMatch ? parseInt(blockedMatch[1], 10) : 0;

  // If all tests are blocked (0 passed, 0 failed, >0 blocked), treat as failure
  if (passedCount === 0 && failedCount === 0 && blockedCount > 0) {
    return {
      report,
      passedCount: 0,
      failedCount: blockedCount,
    };
  }

  return {
    report,
    passedCount,
    failedCount,
  };
}

/**
 * Fallback: scan raw streaming output for individual "TC-XXX PASS" / "TC-XXX FAIL" lines
 * when the CLI dies before emitting the formal report (e.g. budget exhaustion).
 */
function extractFallbackResults(
  allText: string,
): { report: string; passedCount: number; failedCount: number } | null {
  // Match lines like "TC-001 PASS", "TC-016 PASS —", "TC-003 FAIL —", etc.
  const passLines = allText.match(/\bTC-\d+[^\n]*\bPASS\b/gi) || [];
  const failLines = allText.match(/\bTC-\d+[^\n]*\bFAIL\b/gi) || [];

  const passedCount = passLines.length;
  const failedCount = failLines.length;

  if (passedCount === 0 && failedCount === 0) return null;

  // Build a synthetic report from the raw lines
  const lines: string[] = [
    '# Test Execution Report (Reconstructed)',
    '',
    '> **Note:** The test runner was interrupted before producing its final report.',
    '> These results were reconstructed from individual test case outputs.',
    '',
    '## Summary',
    `- **Total Tests:** ${passedCount + failedCount}`,
    `- **Passed:** ${passedCount}`,
    `- **Failed:** ${failedCount}`,
    `- **Status:** ${failedCount === 0 ? 'PASSED' : 'FAILED'}`,
    '',
    '## Results',
    '',
  ];

  for (const l of passLines) lines.push(`- ✅ ${l.trim()}`);
  for (const l of failLines) lines.push(`- ❌ ${l.trim()}`);

  return {
    report: lines.join('\n'),
    passedCount,
    failedCount,
  };
}
