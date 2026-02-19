import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, requireRole, validateAuth } from '@/lib/auth/middleware';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const defaultRuleIds = new Set([
  'blocked-high',
  'blocked-medium',
  'blocked-low',
  'error-all',
  'completed-high',
  'completed-batch',
  'idle-all',
  'stale-all',
]);

const PatchAlertRuleSchema = z
  .object({
    delay_ms: z.number().int().min(0).optional(),
    channel: z.enum(['push', 'in_app', 'both']).optional(),
    enabled: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one update field is required',
  });

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'admin');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  try {
    const { id } = await context.params;
    const rule = db.getAlertRule(id);

    if (!rule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404, headers: corsHeaders(request) });
    }

    return NextResponse.json({ rule }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching alert rule:', error);
    return NextResponse.json({ error: 'Failed to fetch alert rule' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'owner');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const updates = PatchAlertRuleSchema.parse(body);
    const rule = db.updateAlertRule(id, updates);

    return NextResponse.json({ rule }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404, headers: corsHeaders(request) });
    }

    console.error('Error updating alert rule:', error);
    return NextResponse.json({ error: 'Failed to update alert rule' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'owner');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  const rateLimitResult = checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    const headers = new Headers(corsHeaders(request));
    headers.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 1));
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers });
  }

  try {
    const { id } = await context.params;
    const deleted = db.deleteAlertRule(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const warning = defaultRuleIds.has(id)
      ? 'Deleted default alert rule. Consider recreating it if this was unintentional.'
      : null;

    return NextResponse.json({ success: true, warning }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    return NextResponse.json({ error: 'Failed to delete alert rule' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
