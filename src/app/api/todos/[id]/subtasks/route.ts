import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateSubtaskTodoSchema = z.object({
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled', 'icebox']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  agent: z.string().optional(),
  project: z.string().nullable().optional(),
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
    const subtasks = db.getChildTodos(params.id);

    return NextResponse.json(
      { subtasks },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching subtasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subtasks' },
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
    const parentTodo = db.getTodo(params.id);
    if (!parentTodo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const parentDepth = db.getTodoDepth(params.id);
    if (parentDepth + 1 > 3) {
      return NextResponse.json(
        { error: 'Maximum todo depth exceeded' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const data = CreateSubtaskTodoSchema.parse(body);

    const todo = db.createTodo({
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      content: data.content,
      status: data.status || 'pending',
      priority: data.priority || 'medium',
      agent: data.agent || null,
      project: data.project ?? null,
      parent_id: params.id,
      session_id: parentTodo.session_id,
    });

    return NextResponse.json(
      { todo },
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

    console.error('Error creating subtask todo:', error);
    return NextResponse.json(
      { error: 'Failed to create subtask todo' },
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
