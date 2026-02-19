import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const invite = db.getInviteLink(id);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const now = Math.floor(Date.now() / 1000);
    return NextResponse.json(
      {
        invite: {
          id: invite.id,
          role: invite.role,
          expires_at: invite.expires_at,
          used: Boolean(invite.used_by),
          expired: invite.expires_at < now,
        },
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error('Error fetching invite link:', error);
    return NextResponse.json({ error: 'Failed to fetch invite link' }, { status: 500, headers: corsHeaders(request) });
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
