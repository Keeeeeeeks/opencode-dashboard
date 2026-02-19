import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, requireRole, validateAuth } from '@/lib/auth/middleware';

const InviteRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('direct'),
    github_username: z.string().trim().min(1),
    role: z.enum(['admin', 'viewer']),
  }),
  z.object({
    mode: z.literal('link'),
    role: z.enum(['admin', 'viewer']),
    expires_in_hours: z.number().int().min(1).max(24 * 30).optional(),
  }),
]);

type GithubUserResponse = {
  id: number;
  login: string;
  avatar_url: string | null;
  name?: string | null;
};

export async function POST(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'owner');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const body = await request.json();
    const data = InviteRequestSchema.parse(body);

    if (data.mode === 'direct') {
      const githubRes = await fetch(`https://api.github.com/users/${encodeURIComponent(data.github_username)}`);
      if (githubRes.status === 404) {
        return NextResponse.json({ error: 'GitHub user not found' }, { status: 400, headers: corsHeaders(request) });
      }
      if (!githubRes.ok) {
        return NextResponse.json({ error: 'Failed to fetch GitHub user' }, { status: 502, headers: corsHeaders(request) });
      }

      const githubUser = (await githubRes.json()) as GithubUserResponse;
      const user = db.createUser({
        github_id: githubUser.id,
        username: githubUser.login,
        display_name: githubUser.name ?? githubUser.login,
        avatar_url: githubUser.avatar_url,
        role: data.role,
      });

      return NextResponse.json({ user }, { status: 201, headers: corsHeaders(request) });
    }

    if (!authResult.user) {
      return NextResponse.json({ error: 'User context required' }, { status: 403, headers: corsHeaders(request) });
    }

    const expiresInHours = data.expires_in_hours ?? 24;
    const now = Math.floor(Date.now() / 1000);
    const id = randomBytes(16).toString('hex');
    const expires_at = now + expiresInHours * 3600;

    db.createInviteLink({
      id,
      created_by: authResult.user.id,
      role: data.role,
      expires_at,
    });

    return NextResponse.json(
      {
        invite: {
          id,
          url: `/invite/${id}`,
          expires_at,
          role: data.role,
        },
      },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400, headers: corsHeaders(request) });
    }

    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
