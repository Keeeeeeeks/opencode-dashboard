import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { eventBus } from '@/lib/events/eventBus';

const AgentTypeSchema = z.enum(['primary', 'sub-agent']);
const AgentStatusSchema = z.enum(['idle', 'working', 'blocked', 'sleeping', 'offline']);

const UpdateAgentSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: AgentTypeSchema.optional(),
    parent_agent_id: z.string().nullable().optional(),
    status: AgentStatusSchema.optional(),
    soul_md: z.string().nullable().optional(),
    skills: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    current_task_id: z.string().nullable().optional(),
    last_heartbeat: z.number().int().nullable().optional(),
    config: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

function serializeJsonField(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function parseJsonField(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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

    const now = Math.floor(Date.now() / 1000);
    const taskHistory = db.getAgentTasks(params.id);
    const subAgents = db.getAllAgents({ parent_agent_id: params.id });

    return NextResponse.json(
      {
        agent: {
          ...agent,
          age_seconds: Math.max(now - agent.created_at, 0),
          skills: parseJsonField(agent.skills),
          config: parseJsonField(agent.config),
        },
        task_history: taskHistory,
        sub_agents: subAgents,
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (error) {
    console.error('Error fetching agent detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent detail' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

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
    const body = await request.json();
    const data = UpdateAgentSchema.parse(body);

    const updates = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.parent_agent_id !== undefined ? { parent_agent_id: data.parent_agent_id } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.soul_md !== undefined ? { soul_md: data.soul_md } : {}),
      ...(data.skills !== undefined ? { skills: serializeJsonField(data.skills) } : {}),
      ...(data.current_task_id !== undefined ? { current_task_id: data.current_task_id } : {}),
      ...(data.last_heartbeat !== undefined ? { last_heartbeat: data.last_heartbeat } : {}),
      ...(data.config !== undefined ? { config: serializeJsonField(data.config) } : {}),
    };

    const agent = db.updateAgent(params.id, updates);

    eventBus.publish({
      type: 'agent:status',
      payload: { agent, action: 'updated' },
      timestamp: Date.now(),
    });

    return NextResponse.json({ agent }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    console.error('Error updating agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500, headers: corsHeaders(request) });
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
    const existingAgent = db.getAgent(params.id);
    if (!existingAgent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const tasks = db.getAgentTasks(params.id);
    for (const task of tasks) {
      db.deleteAgentTask(task.id);
    }
    db.deleteAgent(params.id);

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
