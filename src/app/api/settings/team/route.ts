import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, requireRole, validateAuth } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'owner');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  try {
    const users = db.getAllUsers();
    return NextResponse.json({ users }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching team users:', error);
    return NextResponse.json({ error: 'Failed to fetch team users' }, { status: 500, headers: corsHeaders(request) });
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
