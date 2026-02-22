import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const orchestrator = await getOrchestrator();
    const tasks = orchestrator.getTasks();

    // Group tasks by status for sprint board view
    const board = {
      backlog: tasks.filter(t => t.status === 'backlog'),
      todo: tasks.filter(t => t.status === 'todo'),
      'in-progress': tasks.filter(t => t.status === 'in-progress'),
      review: tasks.filter(t => t.status === 'review'),
      done: tasks.filter(t => t.status === 'done'),
      blocked: tasks.filter(t => t.status === 'blocked'),
    };

    return NextResponse.json({
      sprint: {
        id: 'sprint-1',
        name: 'Sprint 1',
        goal: 'Initial setup and core features',
        status: 'active',
      },
      board,
      totalTasks: tasks.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load sprint', details: String(error) },
      { status: 500 }
    );
  }
}
