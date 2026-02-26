import { NextResponse } from 'next/server';
import { getWorkflow } from '@/lib/agentic/workflow-loader';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler() {
  try {
    const config = getWorkflow();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load workflow configuration', details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withApiLogging(getHandler, 'workflow');
