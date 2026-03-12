import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import { getOrchestrator } from '@/lib/agentic/orchestrator';

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    if (!taskId?.trim()) {
      return NextResponse.json(
        { error: 'taskId is required' },
        { status: 400 },
      );
    }

    const orchestrator = await getOrchestrator();
    const task = orchestrator.getTask(taskId);
    if (!task) {
      return NextResponse.json(
        { error: `Task not found: ${taskId}` },
        { status: 404 },
      );
    }

    if (!task.testReport) {
      return NextResponse.json(
        { error: `No test report found for task: ${taskId}` },
        { status: 404 },
      );
    }

    return new NextResponse(task.testReport, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/markdown; charset=utf-8',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load test report', details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withApiLogging(getHandler, 'tasks/test-report');
