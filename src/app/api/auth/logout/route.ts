import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders } from '@/lib/auth/middleware';
import { clearSessionCookie, hashToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const session = db.getAuthSessionByTokenHash(hashToken(token));
    if (session) {
      db.deleteAuthSession(session.id);
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
