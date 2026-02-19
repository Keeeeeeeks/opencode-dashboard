import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, corsHeaders, validateAuth } from '@/lib/auth/middleware';
import db from '@/lib/db';
import { eventBus } from '@/lib/events/eventBus';
import { getLinearClient } from '@/lib/linear/client';

const SyncRequestSchema = z
  .object({
    project_id: z.string().min(1).optional(),
  })
  .optional();

const UpdateIssueStateSchema = z.object({
  issueId: z.string().min(1),
  stateId: z.string().min(1),
});

function labelNamesToJson(labelNames: string[]): string | null {
  return labelNames.length > 0 ? JSON.stringify(labelNames) : null;
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
    const bodyText = await request.text();
    const parsedBody = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
    const body = SyncRequestSchema.parse(parsedBody);

    const linear = getLinearClient();

    let statesCount = 0;
    let projectsCount = 0;
    let issuesCount = 0;

    const teams = await linear.teams({ first: 50 });
    for (const team of teams.nodes) {
      const states = await team.states({ first: 100 });
      for (const state of states.nodes) {
        db.upsertLinearWorkflowState({
          id: state.id,
          team_id: state.teamId || team.id,
          name: state.name,
          type: state.type,
          color: state.color || null,
          position: Number.isFinite(state.position) ? state.position : null,
        });
        statesCount += 1;
      }
    }

    const projectsConnection = await linear.projects({ first: 50 });
    const projects = body?.project_id
      ? projectsConnection.nodes.filter((project) => project.id === body.project_id)
      : projectsConnection.nodes;

    for (const project of projects) {
      const projectTeams = await project.teams({ first: 1 });
      const primaryTeam = projectTeams.nodes[0] || null;

      db.upsertLinearProject({
        id: project.id,
        name: project.name,
        description: project.description || null,
        state: project.state || null,
        progress: project.progress || 0,
        start_date: project.startDate || null,
        target_date: project.targetDate || null,
        url: project.url || null,
        team_id: primaryTeam?.id || null,
        team_name: primaryTeam?.name || null,
        synced_at: Math.floor(Date.now() / 1000),
      });
      projectsCount += 1;

      const issues = await project.issues({ first: 100 });
      for (const issue of issues.nodes) {
        const state = issue.state ? await issue.state : null;
        const assignee = issue.assignee ? await issue.assignee : null;
        const labelsConnection = await issue.labels({ first: 20 });
        const labelNames = labelsConnection.nodes.map((label) => label.name).filter(Boolean);

        const existing = db.getLinearIssue(issue.id);

        db.upsertLinearIssue({
          id: issue.id,
          project_id: issue.projectId || project.id,
          identifier: issue.identifier || null,
          title: issue.title,
          description: issue.description || null,
          priority: issue.priority || 0,
          state_name: state?.name || null,
          state_type: state?.type || null,
          assignee_name: assignee?.displayName || assignee?.name || null,
          assignee_avatar: assignee?.avatarUrl || null,
          label_names: labelNamesToJson(labelNames),
          estimate: issue.estimate ?? null,
          url: issue.url || null,
          agent_task_id: existing?.agent_task_id || null,
          synced_at: Math.floor(Date.now() / 1000),
        });
        issuesCount += 1;
      }
    }

    eventBus.publish({
      type: 'project:updated',
      payload: {
        synced: {
          projects: projectsCount,
          issues: issuesCount,
          states: statesCount,
        },
      },
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'todo:updated',
      payload: { synced_issues: issuesCount },
      timestamp: Date.now(),
    });

    return NextResponse.json(
      {
        synced: {
          projects: projectsCount,
          issues: issuesCount,
          states: statesCount,
        },
      },
      { status: 200, headers: corsHeaders(request) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Linear sync failed:', error);
    return NextResponse.json({ error: 'Failed to sync Linear data' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PATCH(request: NextRequest) {
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
    const data = UpdateIssueStateSchema.parse(body);

    const linear = getLinearClient();
    await linear.updateIssue(data.issueId, { stateId: data.stateId });

    const existingIssue = db.getLinearIssue(data.issueId);
    if (!existingIssue) {
      return NextResponse.json({ error: 'Issue not found in cache' }, { status: 404, headers: corsHeaders(request) });
    }

    const state = db.getAllLinearWorkflowStates().find((workflowState) => workflowState.id === data.stateId);

    const issue = db.upsertLinearIssue({
      ...existingIssue,
      state_name: state?.name || existingIssue.state_name,
      state_type: state?.type || existingIssue.state_type,
      synced_at: Math.floor(Date.now() / 1000),
    });

    eventBus.publish({
      type: 'todo:updated',
      payload: { issue },
      timestamp: Date.now(),
    });

    return NextResponse.json({ issue }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    console.error('Failed to update Linear issue state:', error);
    return NextResponse.json({ error: 'Failed to update issue state' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: NextRequest) {
  const headers = new Headers(corsHeaders(request));
  headers.set('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS');

  return new NextResponse(null, { status: 200, headers });
}
