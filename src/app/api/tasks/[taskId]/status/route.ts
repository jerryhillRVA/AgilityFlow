import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { isValidTransition, getValidTransitions } from '@/lib/agentic/task-transitions';
import { getAllStatusIds } from '@/lib/agentic/workflow-loader';
import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import type { TaskStatus } from '@/types/task';

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const newStatus = body.status as TaskStatus;

    const validStatuses = getAllStatusIds();
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const orchestrator = await getOrchestrator();
    const task = orchestrator.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Subtask status is agent-managed — no manual transitions allowed
    if (task.parentTaskId) {
      return NextResponse.json(
        { error: 'Subtask status is managed by the agent system and cannot be changed manually' },
        { status: 400 }
      );
    }

    const previousStatus = task.status;
    if (!isValidTransition(previousStatus, newStatus)) {
      return NextResponse.json({
        error: `Invalid transition: ${previousStatus} → ${newStatus}`,
        validTransitions: getValidTransitions(previousStatus),
      }, { status: 400 });
    }

    // Decomposition gate: plan-mode task can't leave backlog until orchestrator finishes
    if (previousStatus === 'backlog' && newStatus === 'todo') {
      if (task.decompositionComplete === false) {
        return NextResponse.json({
          error: 'Task is still being decomposed by the orchestrator. Please wait for planning to complete.',
        }, { status: 409 });
      }
    }

    // Subtask gate: parent can't move to review unless all subtasks are done
    if (previousStatus === 'in-progress' && newStatus === 'review') {
      const subtasks = orchestrator.getSubtasks(taskId);
      if (subtasks.length > 0) {
        const notReady = subtasks.filter(s => s.status !== 'done');
        if (notReady.length > 0) {
          return NextResponse.json({
            error: 'Cannot move to review: not all subtasks are done',
            blockedSubtasks: notReady.map(s => ({ id: s.id, title: s.title, status: s.status })),
          }, { status: 400 });
        }
      }
    }

    // manualUpdateStatus is async — fires transition actions in background
    await orchestrator.manualUpdateStatus(taskId, newStatus);

    return NextResponse.json({
      taskId,
      previousStatus,
      status: newStatus,
      updatedAt: task.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update task status', details: String(error) },
      { status: 500 }
    );
  }
}

export const PATCH = withApiLogging(patchHandler, 'tasks/status');
