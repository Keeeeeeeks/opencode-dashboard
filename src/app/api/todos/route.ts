import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateTodoSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  agent: z.string().optional(),
  session_id: z.string().optional(),
});

const BatchTodoSchema = CreateTodoSchema.extend({
  id: z.string(),
});

const BatchTodosRequestSchema = z.object({
  todos: z.array(BatchTodoSchema),
});

type CreateTodoRequest = z.infer<typeof CreateTodoSchema>;

/**
 * GET /api/todos
 * Get all todos with optional filtering
 * Query params: session_id, status (comma-separated), since (timestamp)
 */
export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    const statusParam = searchParams.get('status');
    const sinceParam = searchParams.get('since');

    let todos = db.getAllTodos();

    if (sessionId) {
      todos = todos.filter((t) => t.session_id === sessionId);
    }

    if (statusParam) {
      const statuses = statusParam.split(',');
      todos = todos.filter((t) => statuses.includes(t.status));
    }

    if (sinceParam) {
      const since = parseInt(sinceParam, 10);
      if (!isNaN(since)) {
        todos = todos.filter((t) => t.updated_at >= since);
      }
    }

    return NextResponse.json(
      { todos },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    console.error('Error fetching todos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch todos' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * POST /api/todos
 * Create or update a todo
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
    const data = CreateTodoSchema.parse(body);

    let todo;

    if (data.id) {
      todo = db.updateTodo(data.id, {
        content: data.content,
        status: data.status || 'pending',
        priority: data.priority || 'medium',
        agent: data.agent || null,
        session_id: data.session_id || null,
        updated_at: Date.now(),
      });
    } else {
      todo = db.createTodo({
        id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: data.content,
        status: data.status || 'pending',
        priority: data.priority || 'medium',
        agent: data.agent || null,
        session_id: data.session_id || null,
      });
    }

    return NextResponse.json(
      { todo },
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

    console.error('Error creating/updating todo:', error);
    return NextResponse.json(
      { error: 'Failed to create/update todo' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * PUT /api/todos
 * Batch create or update todos
 */
export async function PUT(request: NextRequest) {
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
    const data = BatchTodosRequestSchema.parse(body);
    const results: Array<{ id: string; action: 'created' | 'updated' }> = [];

    for (const todoData of data.todos) {
      const existingTodo = db.getTodo(todoData.id);

      if (existingTodo) {
        db.updateTodo(todoData.id, {
          content: todoData.content,
          status: todoData.status || 'pending',
          priority: todoData.priority || 'medium',
          agent: todoData.agent || null,
          session_id: todoData.session_id || null,
          updated_at: Date.now(),
        });
        results.push({ id: todoData.id, action: 'updated' });
      } else {
        db.createTodo({
          id: todoData.id,
          content: todoData.content,
          status: todoData.status || 'pending',
          priority: todoData.priority || 'medium',
          agent: todoData.agent || null,
          session_id: todoData.session_id || null,
        });
        results.push({ id: todoData.id, action: 'created' });
      }
    }

    return NextResponse.json(
      { results },
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

    console.error('Error batch creating/updating todos:', error);
    return NextResponse.json(
      { error: 'Failed to batch create/update todos' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

/**
 * OPTIONS /api/todos
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
