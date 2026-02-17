import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateSprintSchema = z.object({
  name: z.string().min(1),
  start_date: z.number().int(),
  end_date: z.number().int(),
  goal: z.string().nullable().optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const sprints = db.getAllSprints();
    return NextResponse.json({ sprints }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching sprints:', error);
    return NextResponse.json({ error: 'Failed to fetch sprints' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const data = CreateSprintSchema.parse(body);

    if (data.end_date < data.start_date) {
      return NextResponse.json(
        { error: 'Invalid sprint range: end_date must be >= start_date' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const sprint = db.createSprint({
      id: `sprint_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      name: data.name,
      start_date: data.start_date,
      end_date: data.end_date,
      goal: data.goal ?? null,
      status: data.status ?? 'planning',
    });

    return NextResponse.json({ sprint }, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error creating sprint:', error);
    return NextResponse.json({ error: 'Failed to create sprint' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
