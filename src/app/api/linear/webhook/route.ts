import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/auth/middleware';
import db from '@/lib/db';
import { eventBus } from '@/lib/events/eventBus';
import { lifecycleManager } from '@/lib/agents/lifecycle';

type WebhookAction = 'create' | 'update' | 'remove';

type LinearWebhookPayload = {
  type?: string;
  action?: WebhookAction;
  data?: Record<string, unknown>;
};

function normalizeName(value: string | null): string {
  return (value || '').trim().toLowerCase();
}

function mapLinearPriority(priority: number): 'high' | 'medium' | 'low' {
  if (priority >= 3) {
    return 'high';
  }
  if (priority >= 2) {
    return 'medium';
  }
  return 'low';
}

function isAutoAssignmentState(stateType: string | null, stateName: string | null): boolean {
  const stateTypeNormalized = normalizeName(stateType);
  const stateNameNormalized = normalizeName(stateName);

  return (
    stateTypeNormalized === 'started' ||
    stateTypeNormalized === 'in_progress' ||
    stateNameNormalized === 'started' ||
    stateNameNormalized === 'in progress' ||
    stateNameNormalized === 'in_progress'
  );
}

async function maybeAutoAssignIssue(issueId: string): Promise<void> {
  const issue = db.getLinearIssue(issueId);
  if (!issue || issue.agent_task_id) {
    return;
  }

  if (!isAutoAssignmentState(issue.state_type, issue.state_name)) {
    return;
  }

  const assignee = normalizeName(issue.assignee_name);
  if (!assignee) {
    return;
  }

  const matchedAgent = db.getAllAgents().find((agent) => normalizeName(agent.name) === assignee);
  if (!matchedAgent) {
    return;
  }

  try {
    await lifecycleManager.assignTask({
      agentId: matchedAgent.id,
      taskId: `linear_${issue.id}`,
      linearIssueId: issue.id,
      projectId: issue.project_id || undefined,
      title: issue.title,
      priority: mapLinearPriority(issue.priority),
    });
  } catch (error) {
    console.error('Auto-assignment from Linear webhook failed:', error);
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function upsertIssueFromWebhook(data: Record<string, unknown>) {
  const issueId = toStringOrNull(data.id);
  if (!issueId) {
    throw new Error('Issue webhook payload missing id');
  }

  const existing = db.getLinearIssue(issueId);
  const state = toRecord(data.state);
  const assignee = toRecord(data.assignee);
  const project = toRecord(data.project);

  const labelsRaw = data.labels;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw
        .map((label) => {
          const item = toRecord(label);
          return item ? toStringOrNull(item.name) : null;
        })
        .filter((value): value is string => value !== null)
    : [];

  const issue = db.upsertLinearIssue({
    id: issueId,
    project_id: toStringOrNull(data.projectId) || (project ? toStringOrNull(project.id) : null) || existing?.project_id || null,
    identifier: toStringOrNull(data.identifier) || existing?.identifier || null,
    title: toStringOrNull(data.title) || existing?.title || 'Untitled issue',
    description: toStringOrNull(data.description) || existing?.description || null,
    priority: toNumberOrNull(data.priority) ?? existing?.priority ?? 0,
    state_name: (state ? toStringOrNull(state.name) : null) || existing?.state_name || null,
    state_type: (state ? toStringOrNull(state.type) : null) || existing?.state_type || null,
    assignee_name:
      (assignee ? toStringOrNull(assignee.displayName) || toStringOrNull(assignee.name) : null) ||
      existing?.assignee_name ||
      null,
    assignee_avatar:
      (assignee ? toStringOrNull(assignee.avatarUrl) || toStringOrNull(assignee.avatar) : null) ||
      existing?.assignee_avatar ||
      null,
    label_names: labels.length > 0 ? JSON.stringify(labels) : existing?.label_names || null,
    estimate: toNumberOrNull(data.estimate) ?? existing?.estimate ?? null,
    url: toStringOrNull(data.url) || existing?.url || null,
    agent_task_id: existing?.agent_task_id || null,
    synced_at: Math.floor(Date.now() / 1000),
  });

  eventBus.publish({
    type: 'todo:updated',
    payload: { issue },
    timestamp: Date.now(),
  });

  return issue;
}

function upsertProjectFromWebhook(data: Record<string, unknown>) {
  const projectId = toStringOrNull(data.id);
  if (!projectId) {
    throw new Error('Project webhook payload missing id');
  }

  const existing = db.getLinearProject(projectId);
  const team = toRecord(data.team);

  const project = db.upsertLinearProject({
    id: projectId,
    name: toStringOrNull(data.name) || existing?.name || 'Untitled project',
    description: toStringOrNull(data.description) || toStringOrNull(data.content) || existing?.description || null,
    state: toStringOrNull(data.state) || existing?.state || null,
    progress: toNumberOrNull(data.progress) ?? existing?.progress ?? 0,
    start_date: toStringOrNull(data.startDate) || existing?.start_date || null,
    target_date: toStringOrNull(data.targetDate) || existing?.target_date || null,
    url: toStringOrNull(data.url) || existing?.url || null,
    team_id: toStringOrNull(data.teamId) || (team ? toStringOrNull(team.id) : null) || existing?.team_id || null,
    team_name: (team ? toStringOrNull(team.name) : null) || existing?.team_name || null,
    synced_at: Math.floor(Date.now() / 1000),
  });

  eventBus.publish({
    type: 'project:updated',
    payload: { project },
    timestamp: Date.now(),
  });

  return project;
}

export async function POST(request: NextRequest) {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'LINEAR_WEBHOOK_SECRET environment variable is required' },
      { status: 500, headers: corsHeaders(request) }
    );
  }

  const signature = request.headers.get('linear-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Linear signature' }, { status: 401, headers: corsHeaders(request) });
  }

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid Linear signature' }, { status: 401, headers: corsHeaders(request) });
  }

  try {
    const payload = JSON.parse(rawBody) as LinearWebhookPayload;
    const eventType = payload.type;
    const action = payload.action;
    const data = toRecord(payload.data);

    if (!eventType || !action || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400, headers: corsHeaders(request) });
    }

    if (eventType === 'Issue') {
      const issueId = toStringOrNull(data.id);
      if (!issueId) {
        return NextResponse.json({ error: 'Issue payload missing id' }, { status: 400, headers: corsHeaders(request) });
      }

      if (action === 'remove') {
        db.deleteLinearIssue(issueId);
        eventBus.publish({
          type: 'todo:updated',
          payload: { issue_id: issueId, action: 'remove' },
          timestamp: Date.now(),
        });
      } else {
        const issue = upsertIssueFromWebhook(data);
        await maybeAutoAssignIssue(issue.id);
      }
    } else if (eventType === 'Project') {
      const projectId = toStringOrNull(data.id);
      if (!projectId) {
        return NextResponse.json(
          { error: 'Project payload missing id' },
          { status: 400, headers: corsHeaders(request) }
        );
      }

      if (action === 'remove') {
        db.deleteLinearProject(projectId);
        eventBus.publish({
          type: 'project:updated',
          payload: { project_id: projectId, action: 'remove' },
          timestamp: Date.now(),
        });
      } else {
        upsertProjectFromWebhook(data);
      }
    } else if (eventType === 'Cycle') {
      console.log('Linear cycle webhook received', { action, data });
    }

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders(request) });
  } catch (error) {
    console.error('Error processing Linear webhook:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500, headers: corsHeaders(request) });
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
