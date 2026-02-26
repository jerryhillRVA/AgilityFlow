import { NextResponse } from 'next/server';
import { getGitHubConnector } from '@/lib/agentic/connectors/github-connector';
import { withApiLogging } from '@/lib/api-logger';

async function postHandler() {
  try {
    const connector = getGitHubConnector();
    // Fire and forget — sync runs in background
    connector.sync().catch(() => {});
    return NextResponse.json({ status: 'sync started' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 },
    );
  }
}

export const POST = withApiLogging(postHandler, 'github/sync');
