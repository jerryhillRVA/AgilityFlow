import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import { getOrchestrator } from '@/lib/agentic/orchestrator';
import { buildReviewChecksResponse } from '@/lib/review-checks';

interface QueryOptions {
  includeHistory: boolean;
  includeLogs: boolean;
}

async function getHandler(
  request: NextRequest,
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

    const parsedOptions = parseQueryOptions(request.nextUrl.searchParams);
    if (!parsedOptions.ok) {
      return NextResponse.json(
        { error: parsedOptions.error },
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

    const payload = buildReviewChecksResponse(task, {
      ticketId: task.id,
      includeHistory: parsedOptions.value.includeHistory,
      includeLogs: parsedOptions.value.includeLogs,
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load review checks', details: String(error) },
      { status: 500 },
    );
  }
}

function parseQueryOptions(searchParams: URLSearchParams): { ok: true; value: QueryOptions } | { ok: false; error: string } {
  const includeHistory = searchParams.get('includeHistory');
  const includeLogs = searchParams.get('includeLogs');

  if (!isBooleanQuery(includeHistory)) {
    return { ok: false, error: 'includeHistory must be "true" or "false" when provided' };
  }
  if (!isBooleanQuery(includeLogs)) {
    return { ok: false, error: 'includeLogs must be "true" or "false" when provided' };
  }

  return {
    ok: true,
    value: {
      includeHistory: includeHistory === 'true',
      includeLogs: includeLogs === 'true',
    },
  };
}

function isBooleanQuery(value: string | null): boolean {
  return value === null || value === 'true' || value === 'false';
}

export const GET = withApiLogging(getHandler, 'tasks/review-checks');
