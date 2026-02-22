import { getRegistry } from '@/lib/agentic/registry';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const registry = await getRegistry();
    return NextResponse.json(registry.listCommands());
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list commands', details: String(error) },
      { status: 500 }
    );
  }
}
