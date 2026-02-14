import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import type { Task } from '@/lib/db';

const ValidateDepsSchema = z.object({
  tag: z.string().min(1).optional(),
});

function detectCycle(graph: Map<number, number[]>): number[] {
  const visited = new Set<number>();
  const inStack = new Set<number>();

  const dfs = (node: number): number[] | null => {
    if (inStack.has(node)) {
      return [node];
    }
    if (visited.has(node)) {
      return null;
    }

    visited.add(node);
    inStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      const cycle = dfs(neighbor);
      if (cycle) {
        if (cycle[0] === node) {
          return cycle;
        }
        return [node, ...cycle];
      }
    }

    inStack.delete(node);
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle && cycle.length > 0) {
      return cycle;
    }
  }

  return [];
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
    const data = ValidateDepsSchema.parse(body);
    const tag = data.tag || 'master';
    const tasks = db.getAllTasks(tag);
    const taskMap = new Map<number, Task>(tasks.map((task) => [task.id, task]));
    const issues: string[] = [];
    const graph = new Map<number, number[]>();

    for (const task of tasks) {
      let deps: number[] = [];
      if (task.dependencies) {
        try {
          const parsed = JSON.parse(task.dependencies) as unknown;
          if (!Array.isArray(parsed)) {
            issues.push(`Task ${task.id} has non-array dependencies`);
          } else {
            deps = parsed
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0);
          }
        } catch {
          issues.push(`Task ${task.id} has invalid dependencies JSON`);
        }
      }

      graph.set(task.id, deps);

      for (const depId of deps) {
        if (depId === task.id) {
          issues.push(`Task ${task.id} cannot depend on itself`);
        }
        if (!taskMap.has(depId)) {
          issues.push(`Task ${task.id} depends on missing task ${depId}`);
        }
      }
    }

    const cycle = detectCycle(graph);
    if (cycle.length > 0) {
      issues.push(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    }

    return NextResponse.json(
      { valid: issues.length === 0, issues },
      {
        status: 200,
        headers: corsHeaders(request),
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Error validating dependencies:', error);
    return NextResponse.json(
      { error: 'Failed to validate dependencies' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
