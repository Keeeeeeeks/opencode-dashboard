import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AgentTaskWorkflowInput, NotificationPayload } from '@/temporal/types';

type DbModule = typeof import('@/lib/db');
type EventBusModule = typeof import('@/lib/events/eventBus');
type ActivitiesModule = typeof import('@/temporal/activities');

let dataDir = '';
let db: DbModule['default'];
let eventBus: EventBusModule['eventBus'];
let activities: ActivitiesModule;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(typeof Bun === 'undefined' ? describe : describe.skip)(
  'temporal supporting logic (requires better-sqlite3 runtime)',
  () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-temporal-test-'));
    process.env.DATA_DIR = dataDir;

    db = (await import('@/lib/db')).default;
    eventBus = (await import('@/lib/events/eventBus')).eventBus;
    activities = await import('@/temporal/activities');
  });

  afterAll(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    expect(db).toBeDefined();
  });

  test('type shape for AgentTaskWorkflowInput is valid', () => {
    const input: AgentTaskWorkflowInput = {
      agentId: uid('agent'),
      agentName: 'Temporal Agent',
      taskId: uid('task'),
      title: 'Temporal typed workflow input',
      priority: 'high',
      skills: ['testing', 'hardening'],
      config: { retries: 2 },
    };

    expect(input.agentName).toBe('Temporal Agent');
    expect(input.priority).toBe('high');
    expect(Array.isArray(input.skills)).toBe(true);
  });

  test('type shape for NotificationPayload is valid', () => {
    const payload: NotificationPayload = {
      type: 'error',
      agentId: uid('agent'),
      taskId: uid('task'),
      title: 'Notification typing',
      priority: 'medium',
      reason: 'typed payload',
      projectId: 'phase10',
    };

    expect(payload.type).toBe('error');
    expect(payload.priority).toBe('medium');
  });

  test.skip('workflow execution requires a running Temporal server', () => {
  });

  test('registerAgent creates agent in DB', async () => {
    const input: AgentTaskWorkflowInput = {
      agentId: uid('agent'),
      agentName: 'Registered Agent',
      taskId: uid('task'),
      title: 'Register activity',
    };

    await activities.registerAgent(input);
    expect(db.getAgent(input.agentId)?.name).toBe('Registered Agent');
  });

  test('startAgentTask creates task and updates agent', async () => {
    const input: AgentTaskWorkflowInput = {
      agentId: uid('agent'),
      agentName: 'Task Runner',
      taskId: uid('task'),
      title: 'Start task activity',
      priority: 'medium',
    };

    await activities.registerAgent(input);
    await activities.startAgentTask(input);

    expect(db.getAgent(input.agentId)?.status).toBe('working');
    expect(db.getAgent(input.agentId)?.current_task_id).toBe(input.taskId);
    expect(db.getAgentTask(input.taskId)?.status).toBe('in_progress');
  });

  test('monitorAgent returns status based on DB state', async () => {
    const input: AgentTaskWorkflowInput = {
      agentId: uid('agent'),
      agentName: 'Monitor Agent',
      taskId: uid('task'),
      title: 'Monitor task',
    };

    await activities.registerAgent(input);
    await activities.startAgentTask(input);

    expect((await activities.monitorAgent(input.agentId, input.taskId)).status).toBe('working');

    db.updateAgentTask(input.taskId, { status: 'blocked', blocked_reason: 'test block' });
    expect((await activities.monitorAgent(input.agentId, input.taskId)).status).toBe('blocked');

    db.updateAgentTask(input.taskId, { status: 'completed' });
    expect((await activities.monitorAgent(input.agentId, input.taskId)).status).toBe('completed');
  });

  test('updateDashboard updates both agent and task', async () => {
    const input: AgentTaskWorkflowInput = {
      agentId: uid('agent'),
      agentName: 'Dashboard Agent',
      taskId: uid('task'),
      title: 'Dashboard update task',
    };

    await activities.registerAgent(input);
    await activities.startAgentTask(input);

    await activities.updateDashboard(input.agentId, 'working', input.taskId, 'in_progress');
    expect(db.getAgent(input.agentId)?.status).toBe('working');
    expect(db.getAgentTask(input.taskId)?.status).toBe('in_progress');

    await activities.updateDashboard(input.agentId, 'idle', input.taskId, 'completed');
    expect(db.getAgentTask(input.taskId)?.status).toBe('completed');
  });

  test('sendNotification creates message and publishes event', async () => {
    const received: string[] = [];
    const listener = (event: { type?: string }) => {
      if (event.type) {
        received.push(event.type);
      }
    };

    eventBus.on('dashboard-event', listener);

    const before = db.getMessages().length;
    await activities.sendNotification({
      type: 'error',
      agentId: uid('agent'),
      taskId: uid('task'),
      title: 'Send notification',
      priority: 'high',
      reason: 'test event',
    });

    await wait(5);
    eventBus.off('dashboard-event', listener);

    expect(db.getMessages().length).toBeGreaterThan(before);
    expect(received.includes('message:created')).toBe(true);
  });
  }
);
