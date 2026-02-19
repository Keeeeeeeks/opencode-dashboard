import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid || !authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const { id } = await context.params;
    const invite = db.getInviteLink(id);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const now = Math.floor(Date.now() / 1000);
    if (invite.used_by || invite.expires_at < now) {
      return NextResponse.json(
        { error: 'This invite link has expired or already been used' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    db.updateUser(authResult.user.id, { role: invite.role });
    db.markInviteLinkUsed(id, authResult.user.id);

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error accepting invite link:', error);
    return NextResponse.json({ error: 'Failed to accept invite link' }, { status: 500, headers: corsHeaders(request) });
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
