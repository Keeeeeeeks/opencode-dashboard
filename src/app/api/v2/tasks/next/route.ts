import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const tag = request.nextUrl.searchParams.get('tag') || 'master';
    const task = db.getNextTask(tag);

    return NextResponse.json(
      { task },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching next task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next task' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
