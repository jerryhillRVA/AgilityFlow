import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

/**
 * POST /api/tasks/:taskId/test
 * Trigger test execution for a parent task's verification artifacts using Claude Code CLI
 * with Chrome MCP browser automation tools.
 * The task must be a parent task in 'review' status with at least one verification artifact.
 * Test execution runs asynchronously — this route returns immediately.
 */
async function postHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const orchestrator = await getOrchestrator();
    const task = orchestrator.getTask(taskId);

    if (!task) {
      return NextResponse.json(
        { error: `Task not found: ${taskId}` },
        { status: 404 },
      );
    }

    if (task.parentTaskId) {
      return NextResponse.json(
        { error: 'Only parent tasks can have tests executed' },
        { status: 400 },
      );
    }

    if (task.status !== 'review') {
      return NextResponse.json(
        { error: `Task must be in 'review' status to run tests (current: ${task.status})` },
        { status: 400 },
      );
    }

    const hasVerificationArtifact = task.artifacts?.some(a => a.category === 'verification');
    if (!hasVerificationArtifact) {
      return NextResponse.json(
        { error: 'Task has no verification artifacts (test cases) to execute' },
        { status: 400 },
      );
    }

    if (task.testStatus === 'testing') {
      return NextResponse.json(
        { error: 'Test execution is already in progress' },
        { status: 409 },
      );
    }

    orchestrator.runTests(taskId);

    return NextResponse.json({
      status: 'testing',
      message: `Test execution started for task "${task.title}"`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to start test execution', details: String(error) },
      { status: 500 },
    );
  }
}

export const POST = withApiLogging(postHandler, 'tasks/test');
