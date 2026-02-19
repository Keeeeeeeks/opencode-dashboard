import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import type { Agent } from '@/lib/db/types';
import { eventBus } from '@/lib/events/eventBus';
import {
  getAgentTaskWorkflowId,
  getTemporalClient,
  TASK_QUEUE,
} from '@/lib/temporal/client';
import type { AgentTaskWorkflowInput } from '@/temporal/types';

const AgentActionSchema = z.object({
  action: z.enum(['sleep', 'stop', 'unblock', 'restart']),
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

function buildWorkflowInput(
  agent: Agent,
  taskId: string,
  title: string,
  priority?: 'high' | 'medium' | 'low',
  linearIssueId?: string | null,
  projectId?: string | null
): AgentTaskWorkflowInput {
  return {
    agentId: agent.id,
    agentName: agent.name,
    agentType: agent.type,
    parentAgentId: agent.parent_agent_id ?? undefined,
    taskId,
    title,
    priority,
    linearIssueId: linearIssueId ?? undefined,
    projectId: projectId ?? undefined,
    soulMd: agent.soul_md ?? undefined,
    skills: parseJsonField<string[]>(agent.skills),
    config: parseJsonField<Record<string, unknown>>(agent.config),
  };
}

async function signalWorkflow(agentId: string, taskId: string, signal: 'sleep' | 'cancel' | 'unblock'): Promise<void> {
  try {
    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(agentId, taskId);
    const handle = client.workflow.getHandle(workflowId);

    if (signal === 'unblock') {
      await handle.signal('unblock', 'manual unblock');
      return;
    }

    await handle.signal(signal);
  } catch (error) {
    console.error(`Failed to signal Temporal workflow (${signal}):`, error);
  }
}

async function startWorkflow(input: AgentTaskWorkflowInput): Promise<void> {
  try {
    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(input.agentId, input.taskId);
    await client.workflow.start('agentTaskWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [input],
    });
  } catch (error) {
    console.error('Failed to start Temporal workflow:', error);
  }
}

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
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
    const body = await request.json();
    const { action } = AgentActionSchema.parse(body);
    const agent = db.getAgent(params.id);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const now = Math.floor(Date.now() / 1000);
    let updatedAgent = agent;

    if (action === 'sleep') {
      updatedAgent = db.updateAgent(params.id, { status: 'sleeping' });
      if (agent.current_task_id) {
        await signalWorkflow(params.id, agent.current_task_id, 'sleep');
      }
    }

    if (action === 'stop') {
      const inProgressTasks = db.getAgentTasks(params.id).filter((task) => task.status === 'in_progress');
      for (const task of inProgressTasks) {
        db.updateAgentTask(task.id, { status: 'cancelled', completed_at: now });
        await signalWorkflow(params.id, task.id, 'cancel');
      }
      updatedAgent = db.updateAgent(params.id, { status: 'offline', current_task_id: null });
    }

    if (action === 'unblock') {
      const blockedTask = db
        .getAgentTasks(params.id)
        .find((task) => task.status === 'blocked') || null;

      if (!blockedTask) {
        return NextResponse.json(
          { error: 'No blocked task found for agent' },
          { status: 400, headers: corsHeaders(request) }
        );
      }

      db.updateAgentTask(blockedTask.id, {
        status: 'in_progress',
        blocked_reason: null,
        blocked_at: null,
        started_at: blockedTask.started_at ?? now,
      });

      updatedAgent = db.updateAgent(params.id, {
        status: 'working',
        current_task_id: blockedTask.id,
      });

      await signalWorkflow(params.id, blockedTask.id, 'unblock');
    }

    if (action === 'restart') {
      updatedAgent = db.updateAgent(params.id, {
        status: 'idle',
        current_task_id: null,
      });

      const recentTask = db
        .getAgentTasks(params.id)
        .find((task) => task.status === 'in_progress' || task.status === 'blocked' || task.status === 'pending');

      const restartTaskId = generateTaskId();
      const restartTitle = recentTask?.title || `Restart task for ${agent.name}`;
      const workflowInput = buildWorkflowInput(
        agent,
        restartTaskId,
        restartTitle,
        recentTask?.priority,
        recentTask?.linear_issue_id,
        recentTask?.project_id
      );

      await startWorkflow(workflowInput);
    }

    eventBus.publish({
      type: 'agent:status',
      payload: { agent: updatedAgent, action },
      timestamp: Date.now(),
    });

    return NextResponse.json({ agent: updatedAgent, action }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error handling agent action:', error);
    return NextResponse.json({ error: 'Failed to handle action' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
