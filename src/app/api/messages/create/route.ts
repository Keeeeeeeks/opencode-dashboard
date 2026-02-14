import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateMessageSchema = z.object({
  type: z.enum(['task_complete', 'error', 'state_change', 'custom', 'worklog']),
  content: z.string().min(1).max(10000),
  session_id: z.string().nullable().optional(),
  todo_id: z.string().nullable().optional(),
  metadata: z
    .object({
      author: z.string().optional(),
      tags: z.array(z.string()).optional(),
      summary_id: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/messages/create
 * Create a new message in the feed.
 * Supports idempotent behavior via metadata.summary_id.
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
    const data = CreateMessageSchema.parse(body);

    // Idempotency: if summary_id is provided, check for existing message with same content hash
    if (data.metadata?.summary_id) {
      const existing = db.getMessages();
      const duplicate = existing.find((m) => m.content.includes(`[summary_id:${data.metadata!.summary_id}]`));
      if (duplicate) {
        return NextResponse.json(
          { success: true, message: duplicate, deduplicated: true },
          { status: 200, headers: corsHeaders(request) }
        );
      }
    }

    // Build content with embedded metadata
    let content = data.content;
    const metaParts: string[] = [];
    if (data.metadata?.author) metaParts.push(`author:${data.metadata.author}`);
    if (data.metadata?.tags?.length) metaParts.push(`tags:${data.metadata.tags.join(',')}`);
    if (data.metadata?.summary_id) metaParts.push(`summary_id:${data.metadata.summary_id}`);
    if (metaParts.length > 0) {
      content += `\n[${metaParts.join(' | ')}]`;
    }

    const message = db.createMessage({
      type: data.type,
      content,
      session_id: data.session_id ?? null,
      todo_id: data.todo_id ?? null,
      read: 0,
    });

    return NextResponse.json({ success: true, message }, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * OPTIONS /api/messages/create
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  });
}
