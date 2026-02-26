import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler() {
  let agenticFsStatus: { status: string; error?: string } = { status: 'unknown' };

  try {
    const fs = getAgenticFSClient();
    agenticFsStatus = await fs.health();
  } catch (error) {
    agenticFsStatus = { status: 'unreachable', error: String(error) };
  }

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    app: 'agility-flow',
    status: 'ok',
    agenticFs: agenticFsStatus,
    adapter: hasApiKey ? 'anthropic' : 'mock',
    timestamp: new Date().toISOString(),
  });
}

export const GET = withApiLogging(getHandler, 'health');
