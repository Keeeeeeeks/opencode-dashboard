import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHmac } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { NextRequest } from 'next/server';

type DbModule = typeof import('@/lib/db');
type RouteModule = typeof import('@/app/api/linear/webhook/route');

let dataDir = '';
let db: DbModule['default'];
let route: RouteModule;

const WEBHOOK_SECRET = 'phase10-linear-secret';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sign(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function createWebhookRequest(payload: Record<string, unknown>, signatureOverride?: string): NextRequest {
  const rawBody = JSON.stringify(payload);
  const request = new Request('http://localhost:3000/api/linear/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'linear-signature': signatureOverride ?? sign(rawBody),
    },
    body: rawBody,
  }) as unknown as NextRequest;

  Object.defineProperty(request, 'nextUrl', {
    value: new URL('http://localhost:3000/api/linear/webhook'),
  });

  return request;
}

(typeof Bun === 'undefined' ? describe : describe.skip)(
  'linear webhook (requires better-sqlite3 runtime)',
  () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-linear-test-'));
    process.env.DATA_DIR = dataDir;
    process.env.LINEAR_WEBHOOK_SECRET = WEBHOOK_SECRET;

    db = (await import('@/lib/db')).default;
    route = await import('@/app/api/linear/webhook/route');
  });

  afterAll(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.env.LINEAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  test('valid webhook signature is accepted', async () => {
    const issueId = uid('issue');
    const req = createWebhookRequest({
      type: 'Issue',
      action: 'create',
      data: { id: issueId, title: 'Webhook test issue', priority: 2 },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(db.getLinearIssue(issueId)?.title).toBe('Webhook test issue');
  });

  test('invalid webhook signature is rejected', async () => {
    const req = createWebhookRequest(
      {
        type: 'Issue',
        action: 'create',
        data: { id: uid('bad-sig-issue'), title: 'Invalid signature issue' },
      },
      'deadbeef'
    );

    const res = await route.POST(req);
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(401);
    expect(body.error).toContain('Invalid Linear signature');
  });

  test('issue create and update events upsert records', async () => {
    const issueId = uid('issue-upsert');
    const createReq = createWebhookRequest({
      type: 'Issue',
      action: 'create',
      data: {
        id: issueId,
        identifier: 'LIN-100',
        title: 'Initial Title',
        state: { name: 'Todo', type: 'unstarted' },
        priority: 1,
      },
    });

    expect((await route.POST(createReq)).status).toBe(200);
    expect(db.getLinearIssue(issueId)?.title).toBe('Initial Title');

    const updateReq = createWebhookRequest({
      type: 'Issue',
      action: 'update',
      data: {
        id: issueId,
        title: 'Updated Title',
        state: { name: 'In Progress', type: 'started' },
        priority: 3,
      },
    });
    expect((await route.POST(updateReq)).status).toBe(200);

    const updated = db.getLinearIssue(issueId);
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.priority).toBe(3);
    expect(updated?.state_type).toBe('started');
  });

  test('issue remove event deletes record', async () => {
    const issueId = uid('issue-remove');
    db.upsertLinearIssue({
      id: issueId,
      project_id: null,
      identifier: 'LIN-101',
      title: 'To be removed',
      description: null,
      priority: 1,
      state_name: null,
      state_type: null,
      assignee_name: null,
      assignee_avatar: null,
      label_names: null,
      estimate: null,
      url: null,
      agent_task_id: null,
      synced_at: Math.floor(Date.now() / 1000),
    });

    const req = createWebhookRequest({
      type: 'Issue',
      action: 'remove',
      data: { id: issueId },
    });

    expect((await route.POST(req)).status).toBe(200);
    expect(db.getLinearIssue(issueId)).toBeNull();
  });

  test('auto-assignment triggers when assignee matches agent name', async () => {
    const issueId = uid('issue-auto');
    const agentId = uid('agent-auto');

    db.createAgent({
      id: agentId,
      name: 'Agent Match',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'idle',
      soul_md: null,
      skills: null,
      current_task_id: null,
      last_heartbeat: null,
      config: null,
    });

    const req = createWebhookRequest({
      type: 'Issue',
      action: 'create',
      data: {
        id: issueId,
        title: 'Auto assign me',
        priority: 3,
        state: { name: 'In Progress', type: 'started' },
        assignee: { displayName: 'agent match' },
      },
    });

    expect((await route.POST(req)).status).toBe(200);

    const taskId = `linear_${issueId}`;
    const task = db.getAgentTask(taskId);
    expect(task?.agent_id).toBe(agentId);
    expect(db.getLinearIssue(issueId)?.agent_task_id).toBe(taskId);

    db.deleteAgentTask(taskId);
    db.deleteAgent(agentId);
  });

  test('auto-assignment no-op when no matching agent', async () => {
    const issueId = uid('issue-no-agent');
    const req = createWebhookRequest({
      type: 'Issue',
      action: 'create',
      data: {
        id: issueId,
        title: 'No assignment expected',
        priority: 2,
        state: { name: 'In Progress', type: 'started' },
        assignee: { displayName: 'missing-agent' },
      },
    });

    expect((await route.POST(req)).status).toBe(200);
    expect(db.getAgentTask(`linear_${issueId}`)).toBeNull();
  });

  test('unknown event type is handled gracefully', async () => {
    const req = createWebhookRequest({
      type: 'UnknownType',
      action: 'create',
      data: { id: uid('unknown') },
    });

    const res = await route.POST(req);
    const body = (await res.json()) as { success: boolean };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
  }
);
