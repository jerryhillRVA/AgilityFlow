import { getRegistry } from '@/lib/agentic/registry';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const registry = await getRegistry();
    return NextResponse.json(registry.listSkills());
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list skills', details: String(error) },
      { status: 500 }
    );
  }
}
