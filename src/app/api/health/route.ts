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

  const configuredAdapter = process.env.MODEL_ADAPTER || 'mock';
  const hasAnthropicApiKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIApiKey = !!process.env.OPENAI_API_KEY;
  const adapter =
    configuredAdapter === 'anthropic'
      ? (hasAnthropicApiKey ? 'anthropic' : 'anthropic (missing api key)')
      : configuredAdapter === 'openai'
        ? (hasOpenAIApiKey ? 'openai' : 'openai (missing api key)')
        : 'mock';

  return NextResponse.json({
    app: 'agility-flow',
    status: 'ok',
    agenticFs: agenticFsStatus,
    adapter,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withApiLogging(getHandler, 'health');
