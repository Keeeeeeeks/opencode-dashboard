import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateSessionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;

/**
 * GET /api/sessions
 * Get all sessions
 */
export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const sessions = db.getAllSessions();

    return NextResponse.json(
      { sessions },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * POST /api/sessions
 * Create a new session
 */
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
    const data = CreateSessionSchema.parse(body);

    const session = db.createSession({
      id: data.id,
      name: data.name || null,
      ended_at: null,
    });

    return NextResponse.json(
      { session },
      {
        status: 201,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * OPTIONS /api/sessions
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
