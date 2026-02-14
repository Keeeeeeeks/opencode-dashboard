import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';

const SubtaskStatusSchema = z.enum(['pending', 'in_progress', 'done', 'blocked', 'cancelled']);

const SubtaskDependenciesSchema = z.union([
  z.string(),
  z.array(z.number().int().positive()),
  z.null(),
]).optional();

const CreateSubtaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: SubtaskStatusSchema.optional(),
  dependencies: SubtaskDependenciesSchema,
  details: z.string().nullable().optional(),
});

const UpdateSubtaskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: SubtaskStatusSchema.optional(),
  dependencies: SubtaskDependenciesSchema,
  details: z.string().nullable().optional(),
});

const DeleteSubtaskSchema = z.object({
  id: z.number().int().positive(),
});

function parseTaskId(idParam: string): number | null {
  const parsed = Number.parseInt(idParam, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeDependencies(
  dependencies: string | number[] | null | undefined
): string | null {
  if (dependencies === undefined || dependencies === null) {
    return null;
  }
  if (Array.isArray(dependencies)) {
    return JSON.stringify(dependencies);
  }
  if (dependencies.trim() === '') {
    return null;
  }
  return dependencies;
}

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
    const taskId = parseTaskId(params.id);
    if (!taskId) {
      return NextResponse.json(
        { error: 'Invalid task id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const subtasks = db.getSubtasks(taskId);

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
    const taskId = parseTaskId(params.id);
    if (!taskId) {
      return NextResponse.json(
        { error: 'Invalid task id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const task = db.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const body = await request.json();
    const data = CreateSubtaskSchema.parse(body);
    const existingSubtasks = db.getSubtasks(taskId);
    const maxSubtaskId = existingSubtasks.reduce((maxId, subtask) => Math.max(maxId, subtask.id), 0);

    const subtask = db.createSubtask({
      id: maxSubtaskId + 1,
      task_id: taskId,
      title: data.title,
      description: data.description ?? null,
      status: data.status || 'pending',
      dependencies: normalizeDependencies(data.dependencies),
      details: data.details ?? null,
    });

    return NextResponse.json(
      { subtask },
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

    console.error('Error creating subtask:', error);
    return NextResponse.json(
      { error: 'Failed to create subtask' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
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
    const taskId = parseTaskId(params.id);
    if (!taskId) {
      return NextResponse.json(
        { error: 'Invalid task id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const data = UpdateSubtaskSchema.parse(body);

    const subtask = db.updateSubtask(taskId, data.id, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.dependencies !== undefined
        ? { dependencies: normalizeDependencies(data.dependencies) }
        : {}),
      ...(data.details !== undefined ? { details: data.details } : {}),
    });

    return NextResponse.json(
      { subtask },
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

    console.error('Error updating subtask:', error);
    return NextResponse.json(
      { error: 'Failed to update subtask' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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
    const taskId = parseTaskId(params.id);
    if (!taskId) {
      return NextResponse.json(
        { error: 'Invalid task id' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const body = await request.json();
    const data = DeleteSubtaskSchema.parse(body);

    const deleted = db.deleteSubtask(taskId, data.id);
    return NextResponse.json(
      { success: deleted },
      {
        status: deleted ? 200 : 404,
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

    console.error('Error deleting subtask:', error);
    return NextResponse.json(
      { error: 'Failed to delete subtask' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
