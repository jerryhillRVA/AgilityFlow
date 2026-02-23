import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { isValidTransition, getValidTransitions } from '@/lib/agentic/task-transitions';
import { NextRequest, NextResponse } from 'next/server';
import type { TaskStatus } from '@/types/task';

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in-progress', 'review', 'done', 'blocked', 'pending'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const newStatus = body.status as TaskStatus;

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
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
