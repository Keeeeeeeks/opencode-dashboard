import { WorkflowNotFoundError } from '@temporalio/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { getAgentTaskWorkflowId, getTemporalClient } from '@/lib/temporal/client';

const SignalSchema = z.object({
  signal: z.enum(['sleep', 'wake', 'unblock', 'cancel']),
  reason: z.string().optional(),
  taskId: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const data = SignalSchema.parse(await request.json());
    const agent = db.getAgent(params.id);

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const taskId = data.taskId || agent.current_task_id;
    if (!taskId) {
      return NextResponse.json(
        { error: 'No taskId provided and agent has no current task' },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const client = await getTemporalClient();
    const workflowId = getAgentTaskWorkflowId(params.id, taskId);
    const handle = client.workflow.getHandle(workflowId);

    if (data.signal === 'sleep') {
      await handle.signal('sleep');
    }

    if (data.signal === 'wake') {
      await handle.signal('wake');
    }

    if (data.signal === 'unblock') {
      await handle.signal('unblock', data.reason || 'manual unblock');
    }

    if (data.signal === 'cancel') {
      await handle.signal('cancel');
    }

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof WorkflowNotFoundError) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404, headers: corsHeaders(request) });
    }

    console.error('Error signaling Temporal workflow:', error);
    return NextResponse.json({ error: 'Failed to signal workflow' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
