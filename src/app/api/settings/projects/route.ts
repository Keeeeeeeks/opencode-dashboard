import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const projects = db.getAllProjects();
    return NextResponse.json({ projects }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500, headers: corsHeaders(request) });
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
