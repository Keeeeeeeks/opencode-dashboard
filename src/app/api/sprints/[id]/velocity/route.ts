import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const params = await context.params;
    const sprint = db.getSprint(params.id);
    if (!sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const velocity = db.getSprintVelocity(params.id);
    return NextResponse.json({ velocity }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching sprint velocity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sprint velocity' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
