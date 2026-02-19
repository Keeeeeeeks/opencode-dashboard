import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders } from '@/lib/auth/middleware';
import { hashToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const token = extractToken(request);
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 200, headers: corsHeaders(request) });
  }

  const session = db.getAuthSessionByTokenHash(hashToken(token));
  if (!session || session.expires_at <= Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ valid: false }, { status: 200, headers: corsHeaders(request) });
  }

  const user = db.getUserById(session.user_id);
  if (!user) {
    return NextResponse.json({ valid: false }, { status: 200, headers: corsHeaders(request) });
  }

  return NextResponse.json(
    {
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
    },
    { status: 200, headers: corsHeaders(request) }
  );
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
