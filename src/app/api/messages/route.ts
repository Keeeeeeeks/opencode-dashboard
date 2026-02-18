import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { eventBus } from '@/lib/events/eventBus';

const MarkReadSchema = z.object({
  ids: z.array(z.string()),
});

/**
 * GET /api/messages
 * Get messages with optional filtering
 * Query params: unread_only (boolean), since (timestamp)
 */
export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const sinceParam = searchParams.get('since');

    let messages = db.getMessages();

    if (unreadOnly) {
      messages = messages.filter((m) => m.read === 0);
    }

    if (sinceParam) {
      const since = parseInt(sinceParam, 10);
      if (!isNaN(since)) {
        messages = messages.filter((m) => m.created_at >= since);
      }
    }

    return NextResponse.json(
      { messages },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * POST /api/messages
 * Mark messages as read
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
    const data = MarkReadSchema.parse(body);

    const results = data.ids.map((id) => {
      const messageId = parseInt(id, 10);
      if (!isNaN(messageId)) {
        return db.markMessageAsRead(messageId);
      }
      return false;
    });

    const successCount = results.filter(Boolean).length;

    eventBus.publish({
      type: 'message:created',
      payload: {},
      timestamp: Date.now(),
    });

    return NextResponse.json(
      { success: true, marked: successCount, total: data.ids.length },
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

    console.error('Error marking messages as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * OPTIONS /api/messages
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
