import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UpdateSprintSchema = z.object({
  name: z.string().min(1).optional(),
  start_date: z.number().int().optional(),
  end_date: z.number().int().optional(),
  goal: z.string().nullable().optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const params = await context.params;
    const sprint = db.getSprint(params.id);
    if (!sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404, headers: corsHeaders(request) });
    }
    return NextResponse.json({ sprint }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching sprint:', error);
    return NextResponse.json({ error: 'Failed to fetch sprint' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const data = UpdateSprintSchema.parse(body);

    const sprint = db.updateSprint(params.id, data);
    return NextResponse.json({ sprint }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400, headers: corsHeaders(request) });
    }
    console.error('Error updating sprint:', error);
    return NextResponse.json({ error: 'Failed to update sprint' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
