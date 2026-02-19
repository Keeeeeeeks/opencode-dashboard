import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { eventBus } from '@/lib/events/eventBus';

const TaskStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']);
const TaskPrioritySchema = z.enum(['high', 'medium', 'low']);

const UpdateAgentTaskSchema = z
  .object({
    linear_issue_id: z.string().nullable().optional(),
    project_id: z.string().nullable().optional(),
    title: z.string().min(1).optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    blocked_reason: z.string().nullable().optional(),
    blocked_at: z.number().int().nullable().optional(),
    started_at: z.number().int().nullable().optional(),
    completed_at: z.number().int().nullable().optional(),
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string; taskId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const agent = db.getAgent(params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const existingTask = db.getAgentTask(params.taskId);
    if (!existingTask || existingTask.agent_id !== params.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const body = await request.json();
    const data = UpdateAgentTaskSchema.parse(body);
    const now = Math.floor(Date.now() / 1000);

    const updates: Parameters<typeof db.updateAgentTask>[1] = {
      ...(data.linear_issue_id !== undefined ? { linear_issue_id: data.linear_issue_id } : {}),
      ...(data.project_id !== undefined ? { project_id: data.project_id } : {}),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.blocked_reason !== undefined ? { blocked_reason: data.blocked_reason } : {}),
      ...(data.blocked_at !== undefined ? { blocked_at: data.blocked_at } : {}),
      ...(data.started_at !== undefined ? { started_at: data.started_at } : {}),
      ...(data.completed_at !== undefined ? { completed_at: data.completed_at } : {}),
    };

    if (data.status === 'blocked') {
      updates.blocked_at = now;
      updates.blocked_reason = data.blocked_reason ?? existingTask.blocked_reason;
      db.updateAgent(params.id, { status: 'blocked', current_task_id: params.taskId });
    }

    if (data.status === 'completed') {
      updates.completed_at = now;
      const idleAgent = db.updateAgent(params.id, { status: 'idle', current_task_id: null });
      eventBus.publish({
        type: 'agent:status',
        payload: { agent: idleAgent, action: 'task_completed', task_id: params.taskId },
        timestamp: Date.now(),
      });
    }

    if (data.status === 'cancelled') {
      const idleAgent = db.updateAgent(params.id, { status: 'idle', current_task_id: null });
      eventBus.publish({
        type: 'agent:status',
        payload: { agent: idleAgent, action: 'task_cancelled', task_id: params.taskId },
        timestamp: Date.now(),
      });
    }

    if (data.status === 'in_progress') {
      updates.started_at = existingTask.started_at ?? now;
      updates.blocked_reason = null;
      updates.blocked_at = null;
      db.updateAgent(params.id, { status: 'working', current_task_id: params.taskId });
    }

    const task = db.updateAgentTask(params.taskId, updates);

    eventBus.publish({
      type: 'agent:status',
      payload: { agent_id: params.id, task, action: 'task_updated' },
      timestamp: Date.now(),
    });

    return NextResponse.json({ task }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error updating agent task:', error);
    return NextResponse.json({ error: 'Failed to update agent task' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
