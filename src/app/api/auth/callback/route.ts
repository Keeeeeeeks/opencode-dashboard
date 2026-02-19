import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  buildSessionCookie,
  generateSessionToken,
  hashToken,
  SESSION_MAX_AGE,
} from '@/lib/auth/session';

const OAUTH_STATE_COOKIE_NAME = 'ocd_oauth_state';
const OAUTH_REDIRECT_COOKIE_NAME = 'ocd_oauth_redirect';

type GithubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GithubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
};

function clearOAuthCookie(name: string): string {
  return `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function safeRedirectPath(encodedPath: string | undefined): string {
  if (!encodedPath) {
    return '/';
  }

  const decoded = decodeURIComponent(encodedPath);
  if (!decoded.startsWith('/') || decoded.startsWith('//')) {
    return '/';
  }

  return decoded;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing GitHub OAuth configuration' }, { status: 500 });
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const redirectCookie = request.cookies.get(OAUTH_REDIRECT_COOKIE_NAME)?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    const errorResponse = NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
    errorResponse.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_STATE_COOKIE_NAME));
    errorResponse.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_REDIRECT_COOKIE_NAME));
    return errorResponse;
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
    cache: 'no-store',
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Failed to exchange OAuth code' }, { status: 502 });
  }

  const tokenPayload = (await tokenRes.json()) as GithubTokenResponse;
  if (!tokenPayload.access_token) {
    return NextResponse.json(
      { error: tokenPayload.error_description || tokenPayload.error || 'Missing GitHub access token' },
      { status: 502 }
    );
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${tokenPayload.access_token}`,
      'User-Agent': 'opencode-dashboard',
    },
    cache: 'no-store',
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch GitHub profile' }, { status: 502 });
  }

  const githubUser = (await userRes.json()) as GithubUserResponse;

  let user = db.getUserByGithubId(githubUser.id);
  if (user) {
    user = db.updateUser(user.id, {
      username: githubUser.login,
      display_name: githubUser.name,
      avatar_url: githubUser.avatar_url,
    });
  } else {
    const userCount = db.getUserCount();
    if (userCount > 0) {
      const unauthorized = NextResponse.json(
        { error: 'Not authorized. Ask an admin for an invite.' },
        { status: 403 }
      );
      unauthorized.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_STATE_COOKIE_NAME));
      unauthorized.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_REDIRECT_COOKIE_NAME));
      return unauthorized;
    }

    user = db.createUser({
      github_id: githubUser.id,
      username: githubUser.login,
      display_name: githubUser.name,
      avatar_url: githubUser.avatar_url,
      role: 'owner',
    });
  }

  const rawSessionToken = generateSessionToken();
  const tokenHash = hashToken(rawSessionToken);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;

  db.createAuthSession({
    id: randomUUID(),
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  const redirectPath = safeRedirectPath(redirectCookie);
  const redirectTarget = new URL(redirectPath, request.nextUrl.origin);
  const response = NextResponse.redirect(redirectTarget);
  response.headers.append('Set-Cookie', buildSessionCookie(rawSessionToken));
  response.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_STATE_COOKIE_NAME));
  response.headers.append('Set-Cookie', clearOAuthCookie(OAUTH_REDIRECT_COOKIE_NAME));
  return response;
}
