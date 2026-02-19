import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type DbModule = typeof import('@/lib/db');
type LifecycleModule = typeof import('@/lib/agents/lifecycle');

let dataDir = '';
let db: DbModule['default'];
let lifecycleManager: LifecycleModule['lifecycleManager'];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(typeof Bun === 'undefined' ? describe : describe.skip)(
  'lifecycle manager (requires better-sqlite3 runtime)',
  () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-lifecycle-test-'));
    process.env.DATA_DIR = dataDir;

    db = (await import('@/lib/db')).default;
    lifecycleManager = (await import('@/lib/agents/lifecycle')).lifecycleManager;
  });

  afterAll(() => {
    lifecycleManager.dispose();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    lifecycleManager.dispose();
    lifecycleManager.setSleepSchedule({ enabled: false, startHour: 2, endHour: 6, timezone: 'UTC' });
  });

  test('assignTask creates task and updates agent status', async () => {
    const agentId = uid('agent');
    const taskId = uid('task');

    db.createAgent({
      id: agentId,
      name: 'Lifecycle Agent',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'idle',
      soul_md: null,
      skills: null,
      current_task_id: null,
      last_heartbeat: null,
      config: null,
    });

    await lifecycleManager.assignTask({
      agentId,
      taskId,
      title: 'Lifecycle assignment',
      priority: 'high',
    });

    expect(db.getAgentTask(taskId)?.status).toBe('pending');
    expect(db.getAgent(agentId)?.status).toBe('working');
  });

  test('detectBlocked sets blocked status and fires alert', async () => {
    const agentId = uid('agent');
    const taskId = uid('task');
    db.createAgent({
      id: agentId,
      name: 'Block Agent',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'working',
      soul_md: null,
      skills: null,
      current_task_id: taskId,
      last_heartbeat: null,
      config: null,
    });
    db.createAgentTask({
      id: taskId,
      agent_id: agentId,
      linear_issue_id: null,
      project_id: null,
      title: 'Blocked Task',
      status: 'in_progress',
      priority: 'high',
      blocked_reason: null,
      blocked_at: null,
      started_at: Math.floor(Date.now() / 1000),
      completed_at: null,
    });

    const beforeMessages = db.getMessages().length;
    lifecycleManager.detectBlocked(agentId, {
      source: 'question',
      reason: 'Need clarification',
      taskId,
    });

    await wait(5);
    expect(db.getAgent(agentId)?.status).toBe('blocked');
    expect(db.getAgentTask(taskId)?.status).toBe('blocked');
    expect(db.getMessages().length).toBeGreaterThan(beforeMessages);
  });

  test('recordError increments and triggers block at threshold', () => {
    const agentId = uid('agent');
    const taskId = uid('task');
    db.createAgent({
      id: agentId,
      name: 'Error Agent',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'working',
      soul_md: null,
      skills: null,
      current_task_id: taskId,
      last_heartbeat: null,
      config: null,
    });
    db.createAgentTask({
      id: taskId,
      agent_id: agentId,
      linear_issue_id: null,
      project_id: null,
      title: 'Error-prone Task',
      status: 'in_progress',
      priority: 'medium',
      blocked_reason: null,
      blocked_at: null,
      started_at: Math.floor(Date.now() / 1000),
      completed_at: null,
    });

    expect(lifecycleManager.recordError(agentId, taskId)).toBe(false);
    expect(lifecycleManager.recordError(agentId, taskId)).toBe(false);
    expect(lifecycleManager.recordError(agentId, taskId)).toBe(true);
    expect(db.getAgentTask(taskId)?.status).toBe('blocked');
  });

  test('completeTask handles completion and sleep window check', async () => {
    const agentId = uid('agent');
    const taskId = uid('task');
    db.createAgent({
      id: agentId,
      name: 'Sleepy Agent',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'working',
      soul_md: null,
      skills: null,
      current_task_id: taskId,
      last_heartbeat: Math.floor(Date.now() / 1000),
      config: null,
    });
    db.createAgentTask({
      id: taskId,
      agent_id: agentId,
      linear_issue_id: null,
      project_id: null,
      title: 'Finish and sleep',
      status: 'in_progress',
      priority: 'low',
      blocked_reason: null,
      blocked_at: null,
      started_at: Math.floor(Date.now() / 1000),
      completed_at: null,
    });

    lifecycleManager.setSleepSchedule({ enabled: true, startHour: 0, endHour: 24, timezone: 'UTC' });
    lifecycleManager.completeTask(agentId, taskId);

    await wait(5);
    expect(db.getAgentTask(taskId)?.status).toBe('completed');
    expect(db.getAgent(agentId)?.status).toBe('sleeping');
  });

  test('shouldSendMessage respects per-agent throttle', () => {
    const agentId = uid('agent');
    expect(lifecycleManager.shouldSendMessage(agentId, 'push')).toBe(true);
    expect(lifecycleManager.shouldSendMessage(agentId, 'push')).toBe(true);
    expect(lifecycleManager.shouldSendMessage(agentId, 'push')).toBe(true);
    expect(lifecycleManager.shouldSendMessage(agentId, 'push')).toBe(false);
  });

  test('triggerSleep and triggerWake toggle status correctly', () => {
    const agentId = uid('agent');
    db.createAgent({
      id: agentId,
      name: 'Wake Agent',
      type: 'sub-agent',
      parent_agent_id: null,
      status: 'idle',
      soul_md: null,
      skills: null,
      current_task_id: null,
      last_heartbeat: null,
      config: null,
    });

    lifecycleManager.triggerSleep(agentId, 'manual', 'maintenance');
    expect(db.getAgent(agentId)?.status).toBe('sleeping');

    lifecycleManager.triggerWake(agentId, 'resume');
    expect(db.getAgent(agentId)?.status).toBe('idle');
  });
  }
);
