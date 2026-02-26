import { NextRequest, NextResponse } from 'next/server';
import { getSettingsService } from '@/lib/agentic/settings-service';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler() {
  try {
    const service = getSettingsService();
    const data = await service.getClientSettings();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load settings', details: String(error) },
      { status: 500 },
    );
  }
}

async function patchHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const service = getSettingsService();

    if (body.github) {
      await service.updateGitHubConfig(body.github);
    }

    const data = await service.getClientSettings();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update settings', details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withApiLogging(getHandler, 'settings');
export const PATCH = withApiLogging(patchHandler, 'settings');
