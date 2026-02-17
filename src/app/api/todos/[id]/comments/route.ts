import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateCommentSchema = z.object({
  body: z.string().min(1),
  author: z.string().min(1).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

    const comments = db.getComments(params.id);

    return NextResponse.json(
      { comments },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500, headers: corsHeaders(request) }
    );
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
    const todo = db.getTodo(params.id);
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const payload = await request.json();
    const data = CreateCommentSchema.parse(payload);

    const comment = db.createComment({
      todo_id: params.id,
      body: data.body,
      author: data.author ?? 'anonymous',
    });

    return NextResponse.json(
      { comment },
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

    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500, headers: corsHeaders(request) }
    );
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
