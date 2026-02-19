import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { eventBus } from '@/lib/events/eventBus';

const TaskStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']);
const TaskPrioritySchema = z.enum(['high', 'medium', 'low']);

const CreateAgentTaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  linear_issue_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const params = await context.params;
    const agent = db.getAgent(params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const tasks = db.getAgentTasks(params.id);
    return NextResponse.json({ tasks }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching agent tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch agent tasks' }, { status: 500, headers: corsHeaders(request) });
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
    const agent = db.getAgent(params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const body = await request.json();
    const data = CreateAgentTaskSchema.parse(body);
    const now = Math.floor(Date.now() / 1000);
    const taskId = data.id || generateTaskId();
    const taskStatus = data.status || 'pending';

    const task = db.createAgentTask({
      id: taskId,
      agent_id: params.id,
      linear_issue_id: data.linear_issue_id ?? null,
      project_id: data.project_id ?? null,
      title: data.title,
      status: taskStatus,
      priority: data.priority || 'medium',
      blocked_reason: null,
      blocked_at: null,
      started_at: taskStatus === 'in_progress' ? now : null,
      completed_at: taskStatus === 'completed' || taskStatus === 'cancelled' ? now : null,
    });

    const updatedAgent = db.updateAgent(params.id, {
      current_task_id: task.id,
      status: 'working',
    });

    eventBus.publish({
      type: 'agent:status',
      payload: { agent: updatedAgent, task, action: 'task_created' },
      timestamp: Date.now(),
    });

    return NextResponse.json({ task }, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error creating agent task:', error);
    return NextResponse.json({ error: 'Failed to create agent task' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
