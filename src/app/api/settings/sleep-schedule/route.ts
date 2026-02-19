import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, corsHeaders, requireRole, validateAuth } from '@/lib/auth/middleware';
import { lifecycleManager } from '@/lib/agents/lifecycle';

const SleepScheduleSchema = z
  .object({
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(0).max(23).optional(),
    timezone: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const roleCheck = requireRole(authResult, 'admin');
  if (!roleCheck.allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  try {
    const schedule = lifecycleManager.getSleepSchedule();
    return NextResponse.json({ schedule }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error reading sleep schedule:', error);
    return NextResponse.json({ error: 'Failed to read sleep schedule' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PUT(request: NextRequest) {
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
    const data = SleepScheduleSchema.parse(await request.json());
    lifecycleManager.setSleepSchedule(data);
    const schedule = lifecycleManager.getSleepSchedule();
    return NextResponse.json({ schedule }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error updating sleep schedule:', error);
    return NextResponse.json({ error: 'Failed to update sleep schedule' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  return new NextResponse(null, { status: 200, headers });
}
