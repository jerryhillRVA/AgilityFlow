import { NextResponse } from 'next/server';
import { getSettingsService } from '@/lib/agentic/settings-service';

export async function GET() {
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

export async function PATCH(request: Request) {
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
