import { getRegistry } from '@/lib/agentic/registry';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const registry = await getRegistry();
    return NextResponse.json(registry.listAgents());
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list agents', details: String(error) },
      { status: 500 }
    );
  }
}
