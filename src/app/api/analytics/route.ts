import { format, startOfWeek } from 'date-fns';
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { corsHeaders, validateAuth } from '@/lib/auth/middleware';

type WeeklyCount = { week: string; completed: number };
type WeeklyCreatedCompleted = { week: string; created: number; completed: number };
type WeeklyCycle = { week: string; average_seconds: number };

type AnalyticsResponse = {
  period: { start: number; end: number };
  throughput: {
    weekly: WeeklyCount[];
  };
  cycle_time: {
    average_seconds: number;
    median_seconds: number;
    entries: Array<{ todo_id: string; seconds: number }>;
    weekly: WeeklyCycle[];
  };
  lead_time: {
    average_seconds: number;
    median_seconds: number;
  };
  created_vs_completed: {
    weekly: WeeklyCreatedCompleted[];
  };
  status_distribution: Record<string, number>;
  priority_distribution: Record<string, number>;
  agent_workload: Array<{ agent: string; total: number; completed: number; in_progress: number }>;
  velocity_trend: Array<{ sprint_id: string; sprint_name: string; total_points: number; completed_points: number }>;
};

function toIsoWeekLabel(unixSeconds: number): string {
  return format(startOfWeek(new Date(unixSeconds * 1000), { weekStartsOn: 1 }), "RRRR-'W'II");
}

function weeksInRange(start: number, end: number): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const startWeek = startOfWeek(new Date(start * 1000), { weekStartsOn: 1 });
  const endWeek = startOfWeek(new Date(end * 1000), { weekStartsOn: 1 });

  for (let current = new Date(startWeek); current.getTime() <= endWeek.getTime(); current.setDate(current.getDate() + 7)) {
    const label = format(current, "RRRR-'W'II");
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid] ?? 0;
}

function inRange(value: number | null | undefined, start: number, end: number): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return value >= start && value <= end;
}

export async function GET(request: NextRequest) {
  const authResult = validateAuth(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
  }

  const startParam = request.nextUrl.searchParams.get('start');
  const endParam = request.nextUrl.searchParams.get('end');
  const sprintIdParam = request.nextUrl.searchParams.get('sprint_id');
  const projectParam = request.nextUrl.searchParams.get('project');
  const agentParam = request.nextUrl.searchParams.get('agent');

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: 'Missing required query params: start and end' },
      { status: 400, headers: corsHeaders(request) }
    );
  }

  const start = Number.parseInt(startParam, 10);
  const end = Number.parseInt(endParam, 10);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
    return NextResponse.json(
      { error: 'Invalid start/end query params' },
      { status: 400, headers: corsHeaders(request) }
    );
  }

  try {
    let scopedTodos = db.getAllTodos();

    if (sprintIdParam) {
      const sprintTodoIds = new Set(db.getSprintTodos(sprintIdParam).map((todo) => todo.id));
      scopedTodos = scopedTodos.filter((todo) => sprintTodoIds.has(todo.id));
    }

    if (projectParam) {
      scopedTodos = scopedTodos.filter((todo) => todo.project === projectParam);
    }

    if (agentParam) {
      scopedTodos = scopedTodos.filter((todo) => todo.agent === agentParam);
    }

    const todosInPeriod = scopedTodos.filter((todo) => inRange(todo.created_at, start, end));
    const completedInPeriod = scopedTodos.filter((todo) => inRange(todo.completed_at, start, end));
    const weekLabels = weeksInRange(start, end);

    const throughputMap = new Map<string, number>(weekLabels.map((week) => [week, 0]));
    const createdMap = new Map<string, number>(weekLabels.map((week) => [week, 0]));
    const completedMap = new Map<string, number>(weekLabels.map((week) => [week, 0]));

    for (const todo of completedInPeriod) {
      if (!todo.completed_at) {
        continue;
      }
      const week = toIsoWeekLabel(todo.completed_at);
      throughputMap.set(week, (throughputMap.get(week) ?? 0) + 1);
      completedMap.set(week, (completedMap.get(week) ?? 0) + 1);
    }

    for (const todo of todosInPeriod) {
      const week = toIsoWeekLabel(todo.created_at);
      createdMap.set(week, (createdMap.get(week) ?? 0) + 1);
    }

    const statusDistribution = todosInPeriod.reduce<Record<string, number>>((acc, todo) => {
      acc[todo.status] = (acc[todo.status] ?? 0) + 1;
      return acc;
    }, {});

    const priorityDistribution = todosInPeriod.reduce<Record<string, number>>((acc, todo) => {
      acc[todo.priority] = (acc[todo.priority] ?? 0) + 1;
      return acc;
    }, {});

    const agentMap = new Map<string, { agent: string; total: number; completed: number; in_progress: number }>();
    for (const todo of todosInPeriod) {
      const key = todo.agent || 'unassigned';
      const current = agentMap.get(key) ?? { agent: key, total: 0, completed: 0, in_progress: 0 };
      current.total += 1;
      if (todo.status === 'completed') {
        current.completed += 1;
      }
      if (todo.status === 'in_progress') {
        current.in_progress += 1;
      }
      agentMap.set(key, current);
    }

    const scopedTodoIds = new Set(scopedTodos.map((todo) => todo.id));
    const historyEntries = db
      .getStatusHistoryInRange(start, end)
      .filter((entry) => scopedTodoIds.has(entry.todo_id));

    const historyByTodo = historyEntries.reduce<Map<string, Array<{ status: string; at: number }>>>((acc, entry) => {
      const list = acc.get(entry.todo_id) ?? [];
      list.push({ status: entry.new_status, at: entry.changed_at });
      acc.set(entry.todo_id, list);
      return acc;
    }, new Map());

    const cycleEntries: Array<{ todo_id: string; seconds: number; week: string }> = [];
    for (const todo of completedInPeriod) {
      const timeline = historyByTodo.get(todo.id);
      if (!timeline || timeline.length === 0 || !todo.completed_at) {
        continue;
      }

      const inProgressAt = timeline.find((entry) => entry.status === 'in_progress')?.at;
      const completedAt = timeline.find((entry) => entry.status === 'completed')?.at;

      if (!inProgressAt || !completedAt || completedAt < inProgressAt) {
        continue;
      }

      cycleEntries.push({
        todo_id: todo.id,
        seconds: completedAt - inProgressAt,
        week: toIsoWeekLabel(completedAt),
      });
    }

    const leadTimes = completedInPeriod
      .map((todo) => (todo.completed_at ? todo.completed_at - todo.created_at : 0))
      .filter((seconds) => seconds > 0);

    const cycleValues = cycleEntries.map((entry) => entry.seconds);
    const cycleByWeek = cycleEntries.reduce<Map<string, number[]>>((acc, entry) => {
      const list = acc.get(entry.week) ?? [];
      list.push(entry.seconds);
      acc.set(entry.week, list);
      return acc;
    }, new Map());

    const sprints = sprintIdParam ? db.getAllSprints().filter((sprint) => sprint.id === sprintIdParam) : db.getAllSprints();
    const velocityTrend = sprints.map((sprint) => {
      const velocity = db.getSprintVelocity(sprint.id);
      return {
        sprint_id: velocity.sprint_id,
        sprint_name: velocity.sprint_name,
        total_points: velocity.total_points,
        completed_points: velocity.completed_points,
      };
    });

    const payload: AnalyticsResponse = {
      period: { start, end },
      throughput: {
        weekly: weekLabels.map((week) => ({ week, completed: throughputMap.get(week) ?? 0 })),
      },
      cycle_time: {
        average_seconds: average(cycleValues),
        median_seconds: median(cycleValues),
        entries: cycleEntries.map((entry) => ({ todo_id: entry.todo_id, seconds: entry.seconds })),
        weekly: weekLabels.map((week) => ({
          week,
          average_seconds: average(cycleByWeek.get(week) ?? []),
        })),
      },
      lead_time: {
        average_seconds: average(leadTimes),
        median_seconds: median(leadTimes),
      },
      created_vs_completed: {
        weekly: weekLabels.map((week) => ({
          week,
          created: createdMap.get(week) ?? 0,
          completed: completedMap.get(week) ?? 0,
        })),
      },
      status_distribution: statusDistribution,
      priority_distribution: priorityDistribution,
      agent_workload: Array.from(agentMap.values()).sort((a, b) => b.total - a.total),
      velocity_trend: velocityTrend,
    };

    return NextResponse.json(payload, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

  return new NextResponse(null, {
    status: 200,
    headers,
  });
}
