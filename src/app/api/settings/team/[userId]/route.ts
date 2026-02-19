import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, requireRole, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'viewer']),
});

function parseUserId(rawUserId: string): number | null {
  const userId = Number.parseInt(rawUserId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }
  return userId;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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
    const { userId: userIdParam } = await context.params;
    const userId = parseUserId(userIdParam);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400, headers: corsHeaders(request) });
    }

    if (authResult.user && authResult.user.id === userId) {
      return NextResponse.json({ error: 'Cannot remove your own account' }, { status: 400, headers: corsHeaders(request) });
    }

    db.deleteUserSessions(userId);
    const deleted = db.deleteUser(userId);
    if (!deleted) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error deleting team user:', error);
    return NextResponse.json({ error: 'Failed to delete team user' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { userId: userIdParam } = await context.params;
    const userId = parseUserId(userIdParam);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400, headers: corsHeaders(request) });
    }

    if (authResult.user && authResult.user.id === userId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400, headers: corsHeaders(request) });
    }

    const body = await request.json();
    const data = UpdateRoleSchema.parse(body);
    const user = db.updateUser(userId, { role: data.role });

    return NextResponse.json({ user }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders(request) });
    }

    console.error('Error updating team user role:', error);
    return NextResponse.json({ error: 'Failed to update team user role' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'DELETE, PATCH, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
