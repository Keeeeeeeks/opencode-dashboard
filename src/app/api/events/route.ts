import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

// Validation schema for events
const EventSchema = z.object({
  type: z.enum(['todo_update', 'error', 'state_change']),
  payload: z.record(z.string(), z.any()),
  sessionId: z.string().optional(),
});

type Event = z.infer<typeof EventSchema>;

/**
 * POST /api/events
 * Receives events from oh-my-opencode
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
    const event = EventSchema.parse(body);

    // Handle different event types
    switch (event.type) {
      case 'todo_update': {
        const { id, content, status, priority, agent } = event.payload;
        if (id) {
          db.updateTodo(id, {
            content,
            status,
            priority,
            agent,
            updated_at: Date.now(),
          });
        }
        break;
      }

      case 'error': {
        const { message, sessionId: sid } = event.payload;
        db.createMessage({
          type: 'error',
          content: message || 'Unknown error',
          session_id: event.sessionId || sid || null,
          todo_id: null,
          read: 0,
        });
        break;
      }

      case 'state_change': {
        const { message, sessionId: sid } = event.payload;
        db.createMessage({
          type: 'state_change',
          content: message || 'State changed',
          session_id: event.sessionId || sid || null,
          todo_id: null,
          read: 0,
        });
        break;
      }
    }

    return NextResponse.json(
      { success: true, event },
      {
        status: 200,
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

    console.error('Event processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process event' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * OPTIONS /api/events
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
