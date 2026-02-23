import { getAgenticFSClient } from '@/lib/agentic-fs-client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    const fs = getAgenticFSClient();
    const content = await fs.downloadFile(fileId);

    // Agentic FS may return 200 with "undefined" for missing/corrupted files
    if (!content || content === 'undefined') {
      return NextResponse.json(
        { error: 'Artifact content not found or unavailable' },
        { status: 404 }
      );
    }

    return NextResponse.json({ fileId, content });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to download artifact', details: String(error) },
      { status: 500 }
    );
  }
}
