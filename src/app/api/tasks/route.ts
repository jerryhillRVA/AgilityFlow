import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, priority, mode } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'title and description are required' },
        { status: 400 }
      );
    }

    const orchestrator = await getOrchestrator();
    const task = await orchestrator.submitTask(title, description, priority, mode);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to submit task', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const orchestrator = await getOrchestrator();
    return NextResponse.json(orchestrator.getTasks());
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list tasks', details: String(error) },
      { status: 500 }
    );
  }
}
