import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { eventBus } from '@/lib/events/eventBus';

const AgentTypeSchema = z.enum(['primary', 'sub-agent']);
const AgentStatusSchema = z.enum(['idle', 'working', 'blocked', 'sleeping', 'offline']);

const CreateAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: AgentTypeSchema.optional(),
  parent_agent_id: z.string().nullable().optional(),
  status: AgentStatusSchema.optional(),
  soul_md: z.string().nullable().optional(),
  skills: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  config: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional(),
});

function serializeJsonField(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const type = searchParams.get('type') || undefined;
    const parentAgentId = searchParams.get('parent_agent_id') || undefined;

    const now = Math.floor(Date.now() / 1000);
    const agents = db.getAllAgents({ status, type, parent_agent_id: parentAgentId });
    const enrichedAgents = agents.map((agent) => ({
      ...agent,
      current_task: agent.current_task_id ? db.getAgentTask(agent.current_task_id) : null,
      sub_agent_count: db.getAllAgents({ parent_agent_id: agent.id }).length,
      age_seconds: Math.max(now - agent.created_at, 0),
    }));

    return NextResponse.json({ agents: enrichedAgents }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500, headers: corsHeaders(request) });
  }
}

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
    const data = CreateAgentSchema.parse(body);

    const agent = db.createAgent({
      id: data.id,
      name: data.name,
      type: data.type ?? 'sub-agent',
      parent_agent_id: data.parent_agent_id ?? null,
      status: data.status ?? 'idle',
      soul_md: data.soul_md ?? null,
      skills: serializeJsonField(data.skills),
      current_task_id: null,
      last_heartbeat: null,
      config: serializeJsonField(data.config),
    });

    eventBus.publish({
      type: 'agent:status',
      payload: { agent, action: 'registered' },
      timestamp: Date.now(),
    });

    return NextResponse.json({ agent }, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error registering agent:', error);
    return NextResponse.json({ error: 'Failed to register agent' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
