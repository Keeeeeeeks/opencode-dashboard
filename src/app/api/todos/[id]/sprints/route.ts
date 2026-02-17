import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const SprintAssignSchema = z.object({
  sprint_id: z.string().min(1),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const params = await context.params;
    const todo = db.getTodo(params.id);
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const sprints = db.getTodoSprints(params.id);
    return NextResponse.json({ sprints }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching todo sprints:', error);
    return NextResponse.json({ error: 'Failed to fetch todo sprints' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const params = await context.params;
    const body = await request.json();
    const data = SprintAssignSchema.parse(body);

    db.assignTodoToSprint(params.id, data.sprint_id);
    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400, headers: corsHeaders(request) });
    }
    console.error('Error assigning todo to sprint:', error);
    return NextResponse.json({ error: 'Failed to assign todo to sprint' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const params = await context.params;
    const body = await request.json();
    const data = SprintAssignSchema.parse(body);

    db.removeTodoFromSprint(params.id, data.sprint_id);
    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400, headers: corsHeaders(request) });
    }
    console.error('Error removing todo from sprint:', error);
    return NextResponse.json({ error: 'Failed to remove todo from sprint' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
