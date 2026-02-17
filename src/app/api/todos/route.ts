import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const CreateTodoSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled', 'icebox']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  agent: z.string().optional(),
  project: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  session_id: z.string().optional(),
  sprint_id: z.string().optional(),
});

const BatchTodoSchema = CreateTodoSchema.extend({
  id: z.string(),
});

const BatchTodosRequestSchema = z.object({
  todos: z.array(BatchTodoSchema),
});

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
    const idParam = searchParams.get('id');

    if (idParam) {
      const todo = db.getTodo(idParam);
      if (!todo) {
        return NextResponse.json({ error: 'Todo not found' }, { status: 404, headers: corsHeaders(request) });
      }
      return NextResponse.json(
        { id: todo.id, content: todo.content, status: todo.status, priority: todo.priority },
        { status: 200, headers: corsHeaders(request) }
      );
    }

    const sessionId = searchParams.get('session_id');
    const statusParam = searchParams.get('status');
    const sinceParam = searchParams.get('since');
    const projectParam = searchParams.get('project');
    const sprintIdParam = searchParams.get('sprint_id');
    const parentIdParam = searchParams.get('parent_id');
    const topLevelParam = searchParams.get('top_level');

    let todos = db.getAllTodos();

    if (sessionId) {
      todos = todos.filter((t) => t.session_id === sessionId);
    }

    if (projectParam) {
      todos = todos.filter((t) => t.project === projectParam);
    }

    if (sprintIdParam) {
      const sprintTodoIds = new Set(db.getSprintTodos(sprintIdParam).map((todo) => todo.id));
      todos = todos.filter((todo) => sprintTodoIds.has(todo.id));
    }

    if (parentIdParam) {
      todos = todos.filter((t) => t.parent_id === parentIdParam);
    }

    if (topLevelParam === 'true') {
      todos = todos.filter((t) => t.parent_id === null || t.parent_id === undefined);
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

    const commentCounts = db.getCommentCounts();
    const sprintMap = db.getTodoSprintMap();
    const todosWithCounts = todos.map((todo) => ({
      ...todo,
      comment_count: commentCounts[todo.id] || 0,
      sprints: sprintMap.get(todo.id) || [],
    }));

    return NextResponse.json(
      { todos: todosWithCounts },
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
    let autoSprintId: string | null = null;

    if (data.id) {
      todo = db.updateTodo(data.id, {
        content: data.content,
        status: data.status || 'pending',
        priority: data.priority || 'medium',
        agent: data.agent || null,
        project: data.project ?? null,
        parent_id: data.parent_id ?? null,
        session_id: data.session_id || null,
        updated_at: Date.now(),
      });
    } else {
      todo = db.createTodo({
        id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        content: data.content,
        status: data.status || 'pending',
        priority: data.priority || 'medium',
        agent: data.agent || null,
        project: data.project ?? null,
        parent_id: data.parent_id ?? null,
        session_id: data.session_id || null,
      });

      if (!data.sprint_id) {
        const activeSprint = db.getActiveSprint();
        if (activeSprint) {
          db.assignTodoToSprint(todo.id, activeSprint.id);
          autoSprintId = activeSprint.id;
        }
      }
    }

    if (data.sprint_id) {
      db.assignTodoToSprint(todo.id, data.sprint_id);
    }

    return NextResponse.json(
      { todo, auto_sprint_id: autoSprintId },
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
           project: todoData.project ?? null,
           parent_id: todoData.parent_id ?? null,
           session_id: todoData.session_id || null,
            updated_at: Date.now(),
          });
          if (todoData.sprint_id) {
            db.assignTodoToSprint(todoData.id, todoData.sprint_id);
          }
        results.push({ id: todoData.id, action: 'updated' });
      } else {
        db.createTodo({
          id: todoData.id,
          content: todoData.content,
          status: todoData.status || 'pending',
           priority: todoData.priority || 'medium',
           agent: todoData.agent || null,
           project: todoData.project ?? null,
           parent_id: todoData.parent_id ?? null,
            session_id: todoData.session_id || null,
          });
          if (todoData.sprint_id) {
            db.assignTodoToSprint(todoData.id, todoData.sprint_id);
          }
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
