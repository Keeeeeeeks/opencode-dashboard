import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import { lifecycleManager } from '@/lib/agents/lifecycle';

const BlockSchema = z
  .object({
    taskId: z.string().min(1),
    source: z.enum(['explicit', 'question', 'repeated_errors', 'idle', 'resource_denied']),
    reason: z.string().min(1),
  })
  .strict();

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
    const agent = db.getAgent(params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const data = BlockSchema.parse(await request.json());
    const task = db.getAgentTask(data.taskId);
    if (!task || task.agent_id !== params.id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404, headers: corsHeaders(request) });
    }

    lifecycleManager.detectBlocked(params.id, {
      source: data.source,
      reason: data.reason,
      taskId: data.taskId,
    });

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error reporting lifecycle block:', error);
    return NextResponse.json({ error: 'Failed to report block' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
