import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const sprints = db.getUnreviewedEndedSprints();
    return NextResponse.json({ sprints }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching unreviewed ended sprints:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unreviewed ended sprints' },
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
