import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/tasks/:taskId/implement
 * Trigger Claude Code SDK implementation for a parent task's design artifacts.
 * The task must be a parent task in 'review' status with at least one design artifact.
 * Implementation runs asynchronously — this route returns immediately.
 */
export async function POST(
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

    // Must be a parent task (no parentTaskId)
    if (task.parentTaskId) {
      return NextResponse.json(
        { error: 'Only parent tasks can be implemented' },
        { status: 400 },
      );
    }

    // Must be in review status
    if (task.status !== 'review') {
      return NextResponse.json(
        { error: `Task must be in 'review' status to implement (current: ${task.status})` },
        { status: 400 },
      );
    }

    // Must have at least one design artifact
    const hasDesignArtifact = task.artifacts?.some(a => a.category === 'design');
    if (!hasDesignArtifact) {
      return NextResponse.json(
        { error: 'Task has no design artifacts to implement' },
        { status: 400 },
      );
    }

    // Must not already be implementing
    if (task.implementationStatus === 'implementing') {
      return NextResponse.json(
        { error: 'Implementation is already in progress' },
        { status: 409 },
      );
    }

    // Kick off implementation asynchronously (non-blocking)
    orchestrator.implementTask(taskId);

    return NextResponse.json({
      status: 'implementing',
      message: `Implementation started for task "${task.title}"`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to start implementation', details: String(error) },
      { status: 500 },
    );
  }
}
