import { getRegistry } from '@/lib/agentic/registry';
import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler(request: NextRequest) {
  try {
    const registry = await getRegistry();
    const type = request.nextUrl.searchParams.get('type');

    if (type) {
      switch (type) {
        case 'agents': return NextResponse.json(registry.listAgents());
        case 'skills': return NextResponse.json(registry.listSkills());
        case 'commands': return NextResponse.json(registry.listCommands());
        case 'templates': return NextResponse.json(registry.listTemplates());
        default:
          return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
      }
    }

    return NextResponse.json({
      agents: registry.listAgents(),
      skills: registry.listSkills(),
      commands: registry.listCommands(),
      templates: registry.listTemplates(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load definitions', details: String(error) },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging(getHandler, 'definitions');
