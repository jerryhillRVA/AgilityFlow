import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

/**
 * POST /api/tasks/approve
 * Approve planned subtasks for execution.
 * Body: { taskIds: string[] }
 */
async function postHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskIds } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: 'taskIds array is required' },
        { status: 400 }
      );
    }

    const orchestrator = await getOrchestrator();

    const invalidIds = taskIds.filter((id: string) => !orchestrator.getTask(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Tasks not found: ${invalidIds.join(', ')}` },
        { status: 404 }
      );
    }

    orchestrator.executeApproved(taskIds);

    return NextResponse.json({
      approved: taskIds.length,
      message: `${taskIds.length} task(s) approved for execution`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to approve tasks', details: String(error) },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, 'tasks/approve');
