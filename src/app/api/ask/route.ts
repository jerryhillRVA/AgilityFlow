import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

async function postHandler(request: NextRequest) {
  try {
    const { query, namespace } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    try {
      const fs = getAgenticFSClient();
      const result = await fs.ask(query, { namespace });
      return NextResponse.json(result);
    } catch {
      // Agentic FS not available — return a helpful fallback
      return NextResponse.json({
        answer: `Agentic FS is not currently available. Your question was: "${query}". Please ensure the Agentic FS service is running at ${process.env.AGENTIC_FS_URL || 'http://localhost:8000'}.`,
        sources: [],
        query,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process question', details: String(error) },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, 'ask');
