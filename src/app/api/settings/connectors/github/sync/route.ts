import { NextResponse } from 'next/server';
import { getGitHubConnector } from '@/lib/agentic/connectors/github-connector';

export async function POST() {
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
