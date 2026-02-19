import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { lifecycleManager } from '@/lib/agents/lifecycle';
import { getAgentTaskWorkflowId, getTemporalClient, TASK_QUEUE } from '@/lib/temporal/client';
import type { AgentTaskWorkflowInput } from '@/temporal/types';

const AssignTaskSchema = z
  .object({
    taskId: z.string().min(1),
    title: z.string().min(1),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    linearIssueId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();

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

function buildWorkflowInput(agentId: string, taskId: string): AgentTaskWorkflowInput | null {
  const agent = db.getAgent(agentId);
  const task = db.getAgentTask(taskId);

  if (!agent || !task) {
    return null;
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    agentType: agent.type,
    parentAgentId: agent.parent_agent_id ?? undefined,
    taskId: task.id,
    title: task.title,
    priority: task.priority,
    linearIssueId: task.linear_issue_id ?? undefined,
    projectId: task.project_id ?? undefined,
    soulMd: agent.soul_md ?? undefined,
    skills: parseJsonField<string[]>(agent.skills),
    config: parseJsonField<Record<string, unknown>>(agent.config),
  };
}

async function startWorkflowIfPossible(agentId: string, taskId: string): Promise<void> {
  try {
    const input = buildWorkflowInput(agentId, taskId);
    if (!input) {
      return;
    }

    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(agentId, taskId);
    await client.workflow.start('agentTaskWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [input],
    });
  } catch (error) {
    console.error('Failed to start Temporal workflow after assignment:', error);
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

    const data = AssignTaskSchema.parse(await request.json());
    const task = await lifecycleManager.assignTask({
      agentId: params.id,
      taskId: data.taskId,
      title: data.title,
      priority: data.priority ?? 'medium',
      linearIssueId: data.linearIssueId,
      projectId: data.projectId,
    });

    void startWorkflowIfPossible(params.id, task.id);

    return NextResponse.json({ task }, { status: 201, headers: corsHeaders(request) });
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

    console.error('Error assigning lifecycle task:', error);
    return NextResponse.json({ error: 'Failed to assign task' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
