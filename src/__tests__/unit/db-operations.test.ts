import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashToken } from '@/lib/auth/session';

type DbModule = typeof import('@/lib/db');

let dataDir = '';
let db: DbModule['default'];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

(typeof Bun === 'undefined' ? describe : describe.skip)(
  'database operations (requires better-sqlite3 runtime)',
  () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ocd-db-test-'));
    process.env.DATA_DIR = dataDir;
    db = (await import('@/lib/db')).default;
  });

  afterAll(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    expect(db).toBeDefined();
  });

  describe('todos', () => {
    test('create, get, getAll, update, delete, status history', () => {
      const todoId = uid('todo');
      const created = db.createTodo({
        id: todoId,
        name: 'Phase 10 Todo',
        session_id: null,
        content: 'Implement test coverage',
        status: 'pending',
        priority: 'high',
        agent: 'agent-alpha',
        project: 'phase10',
        parent_id: null,
      });

      expect(created.id).toBe(todoId);
      expect(db.getTodo(todoId)?.content).toBe('Implement test coverage');
      expect(db.getAllTodos().some((todo) => todo.id === todoId)).toBe(true);

      const updated = db.updateTodo(todoId, { status: 'completed' });
      expect(updated.status).toBe('completed');

      const history = db.getStatusHistory(todoId);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[history.length - 1]?.new_status).toBe('completed');

      expect(db.deleteTodo(todoId)).toBe(true);
      expect(db.getTodo(todoId)).toBeNull();
    });
  });

  describe('messages', () => {
    test('create, get, filter, markAsRead, delete', () => {
      const msg = db.createMessage({
        type: 'custom',
        content: 'Hello dashboard',
        todo_id: null,
        session_id: 'session-a',
        project_id: 'phase10',
        read: 0,
      });

      expect(db.getMessage(msg.id)?.content).toBe('Hello dashboard');
      expect(db.getMessages({ session_id: 'session-a' }).some((entry) => entry.id === msg.id)).toBe(true);
      expect(db.markMessageAsRead(msg.id)).toBe(true);
      expect(db.getMessage(msg.id)?.read).toBe(1);
      expect(db.deleteMessage(msg.id)).toBe(true);
    });
  });

  describe('agents', () => {
    test('create, get, getAll with filters, update, delete', () => {
      const agentId = uid('agent');
      db.createAgent({
        id: agentId,
        name: 'Agent Phase 10',
        type: 'sub-agent',
        parent_agent_id: null,
        status: 'idle',
        soul_md: null,
        skills: null,
        current_task_id: null,
        last_heartbeat: null,
        config: null,
      });

      expect(db.getAgent(agentId)?.name).toBe('Agent Phase 10');
      expect(db.getAllAgents({ status: 'idle' }).some((agent) => agent.id === agentId)).toBe(true);

      db.updateAgent(agentId, { status: 'working' });
      expect(db.getAgent(agentId)?.status).toBe('working');
      expect(db.deleteAgent(agentId)).toBe(true);
    });
  });

  describe('agent tasks', () => {
    test('create, get by agent, update, delete', () => {
      const agentId = uid('agent');
      const taskId = uid('agent-task');
      db.createAgent({
        id: agentId,
        name: 'Task Agent',
        type: 'sub-agent',
        parent_agent_id: null,
        status: 'idle',
        soul_md: null,
        skills: null,
        current_task_id: null,
        last_heartbeat: null,
        config: null,
      });

      db.createAgentTask({
        id: taskId,
        agent_id: agentId,
        linear_issue_id: null,
        project_id: null,
        title: 'Investigate flaky test',
        status: 'pending',
        priority: 'medium',
        blocked_reason: null,
        blocked_at: null,
        started_at: null,
        completed_at: null,
      });

      expect(db.getAgentTask(taskId)?.agent_id).toBe(agentId);
      expect(db.getAgentTasks(agentId).some((task) => task.id === taskId)).toBe(true);

      db.updateAgentTask(taskId, { status: 'blocked', blocked_reason: 'waiting for review' });
      expect(db.getAgentTask(taskId)?.status).toBe('blocked');

      expect(db.deleteAgentTask(taskId)).toBe(true);
      expect(db.deleteAgent(agentId)).toBe(true);
    });
  });

  describe('alert rules', () => {
    test('default seeding plus create/getAll/getForTrigger/update/delete', () => {
      const seeded = db.getAllAlertRules();
      expect(seeded.length).toBeGreaterThanOrEqual(8);
      expect(seeded.some((rule) => rule.id === 'blocked-high')).toBe(true);

      const ruleId = uid('rule');
      db.createAlertRule({
        id: ruleId,
        trigger: 'blocked',
        priority_filter: 'high',
        delay_ms: 200,
        channel: 'both',
        enabled: 1,
      });

      expect(db.getAllAlertRules().some((rule) => rule.id === ruleId)).toBe(true);
      expect(db.getAlertRulesForTrigger('blocked', 'high').some((rule) => rule.id === ruleId)).toBe(true);

      db.updateAlertRule(ruleId, { enabled: 0 });
      expect(db.getAlertRule(ruleId)?.enabled).toBe(0);
      expect(db.deleteAlertRule(ruleId)).toBe(true);
    });
  });

  describe('linear data', () => {
    test('upsert project, issue, workflow state and filter by project', () => {
      const projectId = uid('linear-project');
      const issueId = uid('linear-issue');
      const stateId = uid('linear-state');

      db.upsertLinearProject({
        id: projectId,
        name: 'Phase 10 Project',
        description: null,
        state: 'active',
        progress: 0.5,
        start_date: null,
        target_date: null,
        url: null,
        team_id: 'team-1',
        team_name: 'Team One',
        synced_at: Math.floor(Date.now() / 1000),
      });

      db.upsertLinearIssue({
        id: issueId,
        project_id: projectId,
        identifier: 'LIN-10',
        title: 'Add hardening tests',
        description: null,
        priority: 2,
        state_name: 'In Progress',
        state_type: 'started',
        assignee_name: null,
        assignee_avatar: null,
        label_names: JSON.stringify(['testing']),
        estimate: null,
        url: null,
        agent_task_id: null,
        synced_at: Math.floor(Date.now() / 1000),
      });

      db.upsertLinearWorkflowState({
        id: stateId,
        team_id: 'team-1',
        name: 'In Progress',
        type: 'started',
        color: '#ff0000',
        position: 1,
      });

      expect(db.getLinearProject(projectId)?.name).toBe('Phase 10 Project');
      expect(db.getLinearIssue(issueId)?.identifier).toBe('LIN-10');
      expect(db.getLinearIssuesByProject(projectId).some((issue) => issue.id === issueId)).toBe(true);
      expect(db.getLinearWorkflowStates('team-1').some((state) => state.id === stateId)).toBe(true);

      expect(db.deleteLinearIssue(issueId)).toBe(true);
      expect(db.deleteLinearProject(projectId)).toBe(true);
    });
  });

  describe('users and auth sessions', () => {
    test('create/get/update/delete user and create/get/delete/clean sessions', () => {
      const user = db.createUser({
        github_id: Date.now() + 100,
        username: 'phase10-member',
        display_name: 'Phase 10 Member',
        avatar_url: null,
        role: 'viewer',
      });

      expect(db.getUserByGithubId(user.github_id)?.id).toBe(user.id);

      db.updateUser(user.id, { role: 'admin' });
      expect(db.getUserById(user.id)?.role).toBe('admin');

      const activeSessionId = uid('session');
      db.createAuthSession({
        id: activeSessionId,
        user_id: user.id,
        token_hash: hashToken('active-token'),
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(db.getAuthSessionByTokenHash(hashToken('active-token'))?.id).toBe(activeSessionId);

      const expiredSessionId = uid('session-expired');
      db.createAuthSession({
        id: expiredSessionId,
        user_id: user.id,
        token_hash: hashToken('expired-token'),
        expires_at: Math.floor(Date.now() / 1000) - 10,
      });
      expect(db.cleanExpiredSessions()).toBeGreaterThanOrEqual(1);

      expect(db.deleteAuthSession(activeSessionId)).toBe(true);
      expect(db.deleteUser(user.id)).toBe(true);
    });
  });

  describe('projects', () => {
    test('create, getAll, update, delete', () => {
      const projectId = uid('project');
      db.createProject({
        id: projectId,
        name: 'Phase 10 Internal',
        description: null,
        color: '#00aaee',
      });

      expect(db.getAllProjects().some((project) => project.id === projectId)).toBe(true);
      db.updateProject(projectId, { description: 'Hardening phase project' });
      expect(db.getProject(projectId)?.description).toBe('Hardening phase project');
      expect(db.deleteProject(projectId)).toBe(true);
    });
  });

  describe('sprints', () => {
    test('create, getAll, assignTodo, and velocity', () => {
      const sprintId = uid('sprint');
      const todoId = uid('sprint-todo');
      const now = Math.floor(Date.now() / 1000);

      db.createSprint({
        id: sprintId,
        name: 'Phase 10 Sprint',
        start_date: now - 86_400,
        end_date: now + 86_400,
        goal: 'Increase test coverage',
        status: 'active',
        project_id: null,
      });

      db.createTodo({
        id: todoId,
        name: 'Coverage ticket',
        session_id: null,
        content: 'Add temporal and lifecycle tests',
        status: 'completed',
        priority: 'high',
        agent: null,
        project: null,
        parent_id: null,
      });

      expect(db.getAllSprints().some((sprint) => sprint.id === sprintId)).toBe(true);
      db.assignTodoToSprint(todoId, sprintId);
      expect(db.getSprintTodos(sprintId).some((todo) => todo.id === todoId)).toBe(true);

      const velocity = db.getSprintVelocity(sprintId);
      expect(velocity.total_points).toBeGreaterThan(0);
      expect(velocity.completed_points).toBeGreaterThanOrEqual(0);

      expect(db.deleteTodo(todoId)).toBe(true);
    });
  });
  }
);
