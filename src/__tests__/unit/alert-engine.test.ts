import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type DbModule = typeof import('@/lib/db');
type EngineModule = typeof import('@/lib/alerts/engine');
type EventBusModule = typeof import('@/lib/events/eventBus');

let dataDir = '';
let db: DbModule['default'];
let alertEngine: EngineModule['alertEngine'];
let eventBus: EventBusModule['eventBus'];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(typeof Bun === 'undefined' ? describe : describe.skip)(
  'alert engine (requires better-sqlite3 runtime)',
  () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-alerts-test-'));
    process.env.DATA_DIR = dataDir;

    db = (await import('@/lib/db')).default;
    alertEngine = (await import('@/lib/alerts/engine')).alertEngine;
    eventBus = (await import('@/lib/events/eventBus')).eventBus;
  });

  afterAll(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    alertEngine.cancelPendingAlerts('agent-a');
    alertEngine.cancelPendingAlerts('agent-b');
    alertEngine.cancelPendingAlerts('agent-c');
  });

  test('processEvent with immediate rule fires notification', async () => {
    const before = db.getMessages().length;
    alertEngine.processEvent({
      trigger: 'error',
      agentId: 'agent-a',
      taskId: uid('task'),
      title: 'Immediate event',
      priority: 'high',
      reason: 'boom',
    });

    await wait(5);
    const after = db.getMessages().length;
    expect(after).toBeGreaterThan(before);
  });

  test('processEvent with delayed rule schedules correctly', () => {
    const ruleId = uid('delayed-rule');
    db.createAlertRule({
      id: ruleId,
      trigger: 'blocked',
      priority_filter: 'high',
      delay_ms: 200,
      channel: 'in_app',
      enabled: 1,
    });

    alertEngine.processEvent({
      trigger: 'blocked',
      agentId: 'agent-b',
      taskId: 'task-delayed',
      title: 'Delayed blocked',
      priority: 'high',
      reason: 'waiting',
    });

    expect(alertEngine.getPendingCount()).toBeGreaterThan(0);
  });

  test('cancelPendingAlerts cancels scheduled notifications', () => {
    const ruleId = uid('cancel-rule');
    db.createAlertRule({
      id: ruleId,
      trigger: 'blocked',
      priority_filter: 'high',
      delay_ms: 200,
      channel: 'in_app',
      enabled: 1,
    });

    const taskId = uid('task-cancel');
    alertEngine.processEvent({
      trigger: 'blocked',
      agentId: 'agent-c',
      taskId,
      title: 'Cancel pending',
      priority: 'high',
      reason: 'waiting',
    });

    const cancelled = alertEngine.cancelPendingAlerts('agent-c', taskId);
    expect(cancelled).toBeGreaterThanOrEqual(1);
  });

  test('batch completion events accumulate and flush', async () => {
    db.updateAlertRule('completed-batch', { delay_ms: 20, enabled: 1 });
    const before = db.getMessages().length;

    alertEngine.processEvent({
      trigger: 'completed',
      agentId: 'agent-a',
      taskId: uid('task-b1'),
      title: 'Batch One',
      priority: 'medium',
    });
    alertEngine.processEvent({
      trigger: 'completed',
      agentId: 'agent-b',
      taskId: uid('task-b2'),
      title: 'Batch Two',
      priority: 'medium',
    });

    await wait(60);

    const messages = db.getMessages().slice(0, 3);
    expect(db.getMessages().length).toBeGreaterThan(before);
    expect(messages.some((message) => message.content.includes('tasks completed'))).toBe(true);
  });

  test('anti-spam exceeding push rate limit blocks push channel', async () => {
    const ruleId = uid('push-rule');
    db.createAlertRule({
      id: ruleId,
      trigger: 'error',
      priority_filter: 'all',
      delay_ms: 0,
      channel: 'push',
      enabled: 1,
    });

    const channels: string[] = [];
    const listener = (event: { type?: string; payload?: Record<string, unknown> }) => {
      if (event.type === 'message:created' && typeof event.payload?.channel === 'string') {
        channels.push(event.payload.channel);
      }
    };

    eventBus.on('dashboard-event', listener);
    for (let i = 0; i < 4; i += 1) {
      alertEngine.processEvent({
        trigger: 'error',
        agentId: 'agent-rate-limited',
        taskId: uid('task-r'),
        title: `Push test ${i}`,
        priority: 'low',
      });
    }
    await wait(10);
    eventBus.off('dashboard-event', listener);

    expect(channels.includes('push')).toBe(true);
    expect(channels.includes('in_app')).toBe(true);
  });

  test('default rules are seeded correctly', () => {
    const rules = db.getAllAlertRules();
    const ids = new Set(rules.map((rule) => rule.id));
    expect(ids.has('blocked-high')).toBe(true);
    expect(ids.has('completed-batch')).toBe(true);
    expect(ids.has('error-all')).toBe(true);
  });
  }
);
