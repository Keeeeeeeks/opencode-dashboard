import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/auth/middleware';

const OAUTH_STATE_COOKIE_NAME = 'ocd_oauth_state';
const OAUTH_REDIRECT_COOKIE_NAME = 'ocd_oauth_redirect';
const OAUTH_STATE_MAX_AGE = 10 * 60;

function sanitizeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/';
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: 'Missing GITHUB_CLIENT_ID configuration' }, { status: 500, headers: corsHeaders(request) });
  }

  const state = randomBytes(32).toString('hex');
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:3000';
  const callbackUrl = `${apiBase}/api/auth/callback`;
  const redirectPath = sanitizeRedirectPath(request.nextUrl.searchParams.get('redirect'));

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('scope', 'read:user');

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.append(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE_NAME}=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE}`
  );
  response.headers.append(
    'Set-Cookie',
    `${OAUTH_REDIRECT_COOKIE_NAME}=${encodeURIComponent(redirectPath)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE}`
  );

  const headers = corsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
