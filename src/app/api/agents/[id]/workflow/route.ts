import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import {
  getAgentTaskWorkflowId,
  getTemporalClient,
  TASK_QUEUE,
} from '@/lib/temporal/client';
import type { AgentTaskWorkflowInput } from '@/temporal/types';

const StartWorkflowSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  linearIssueId: z.string().optional(),
  projectId: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseJsonField<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
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
    const data = StartWorkflowSchema.parse(await request.json());
    const agent = db.getAgent(params.id);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(params.id, data.taskId);
    const input: AgentTaskWorkflowInput = {
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      parentAgentId: agent.parent_agent_id ?? undefined,
      taskId: data.taskId,
      title: data.title,
      priority: data.priority,
      linearIssueId: data.linearIssueId,
      projectId: data.projectId,
      soulMd: agent.soul_md ?? undefined,
      skills: parseJsonField<string[]>(agent.skills),
      config: parseJsonField<Record<string, unknown>>(agent.config),
    };

    const handle = await client.workflow.start('agentTaskWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [input],
    });

    return NextResponse.json(
      { workflowId: handle.workflowId, runId: handle.firstExecutionRunId },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      return NextResponse.json(
        { error: 'Workflow already running for this task' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    console.error('Error starting Temporal workflow:', error);
    return NextResponse.json({ error: 'Failed to start workflow' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const params = await context.params;
    const taskIdParam = request.nextUrl.searchParams.get('taskId');
    const agent = db.getAgent(params.id);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const taskId = taskIdParam || agent.current_task_id;
    if (!taskId) {
      return NextResponse.json(
        { error: 'No taskId provided and agent has no current task' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(params.id, taskId);
    const handle = client.workflow.getHandle(workflowId);

    const status = await handle.query<string>('status');
    const progress = await handle.query<{ status: string; taskTitle: string; blockedReason?: string }>('progress');

    return NextResponse.json({ status, progress }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404, headers: corsHeaders(request) });
    }

    console.error('Error querying Temporal workflow:', error);
    return NextResponse.json({ error: 'Failed to query workflow' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
