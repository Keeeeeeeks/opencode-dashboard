import Database from 'better-sqlite3';
import * as path from 'path';
import { encrypt, decrypt, getDataDir } from './encryption';
import type {
  Todo,
  Message,
  Session,
  Setting,
  Task,
  Subtask,
  TodoComment,
  Sprint,
  SprintVelocity,
  User,
  AuthSession,
  InviteLink,
  Project,
  Agent,
  AgentTask,
  AlertRule,
  LinearProject,
  LinearIssue,
  LinearWorkflowState,
  StatusHistoryEntry,
  DatabaseOperations,
} from './types';

const DB_PATH = path.join(getDataDir(), 'data.db');

let dbInstance: Database.Database | null = null;

function initializeDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      agent TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      todo_id TEXT,
      session_id TEXT,
      project_id TEXT,
      read INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      started_at INTEGER DEFAULT (unixepoch()),
      ended_at INTEGER,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS invite_links (
      id TEXT PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'viewer',
      expires_at INTEGER NOT NULL,
      used_by INTEGER REFERENCES users(id),
      used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT DEFAULT 'master',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      dependencies TEXT,
      details TEXT,
      test_strategy TEXT,
      complexity_score REAL,
      assigned_agent_id TEXT,
      linear_issue_id TEXT,
      project_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      dependencies TEXT,
      details TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (task_id, id)
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'sub-agent',
      parent_agent_id TEXT REFERENCES agents(id),
      status TEXT NOT NULL DEFAULT 'idle',
      soul_md TEXT,
      skills TEXT,
      current_task_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_heartbeat INTEGER,
      config TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      linear_issue_id TEXT,
      project_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      blocked_reason TEXT,
      blocked_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL,
      priority_filter TEXT NOT NULL DEFAULT 'all',
      delay_ms INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'in_app',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS linear_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      state TEXT,
      progress REAL DEFAULT 0,
      start_date TEXT,
      target_date TEXT,
      url TEXT,
      team_id TEXT,
      team_name TEXT,
      synced_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS linear_issues (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES linear_projects(id),
      identifier TEXT,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 0,
      state_name TEXT,
      state_type TEXT,
      assignee_name TEXT,
      assignee_avatar TEXT,
      label_names TEXT,
      estimate INTEGER,
      url TEXT,
      agent_task_id TEXT,
      synced_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS linear_workflow_states (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT,
      position REAL
    );

    CREATE TABLE IF NOT EXISTS todo_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'anonymous',
      project_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      goal TEXT,
      status TEXT DEFAULT 'planning',
      project_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS todo_sprints (
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, sprint_id)
    );

    CREATE TABLE IF NOT EXISTS todo_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT,
      changed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_todos_session_id ON todos(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_todo_id ON messages(todo_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
    CREATE INDEX IF NOT EXISTS idx_tasks_tag ON tasks(tag);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
    CREATE INDEX IF NOT EXISTS idx_todo_comments_todo_id ON todo_comments(todo_id);
    CREATE INDEX IF NOT EXISTS idx_todo_sprints_sprint_id ON todo_sprints(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_todo_sprints_todo_id ON todo_sprints(todo_id);
    CREATE INDEX IF NOT EXISTS idx_todo_status_history_todo_id ON todo_status_history(todo_id);
    CREATE INDEX IF NOT EXISTS idx_todo_status_history_changed_at ON todo_status_history(changed_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_invite_links_created_by ON invite_links(created_by);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
    CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_project_id ON agent_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_alert_rules_trigger ON alert_rules(trigger);
    CREATE INDEX IF NOT EXISTS idx_linear_issues_project_id ON linear_issues(project_id);
    CREATE INDEX IF NOT EXISTS idx_linear_issues_state_type ON linear_issues(state_type);
    CREATE INDEX IF NOT EXISTS idx_linear_issues_agent_task_id ON linear_issues(agent_task_id);
    CREATE INDEX IF NOT EXISTS idx_linear_workflow_states_team_id ON linear_workflow_states(team_id);
  `);

  // Migration: add project column to todos if not present
  const columns = db.prepare("PRAGMA table_info(todos)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'project')) {
    db.exec('ALTER TABLE todos ADD COLUMN project TEXT');
  }
  if (!columns.some((c) => c.name === 'parent_id')) {
    db.exec('ALTER TABLE todos ADD COLUMN parent_id TEXT REFERENCES todos(id) ON DELETE CASCADE');
    db.exec('CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos(parent_id)');
  }
  if (!columns.some((c) => c.name === 'completed_at')) {
    db.exec('ALTER TABLE todos ADD COLUMN completed_at INTEGER');
    db.exec("UPDATE todos SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL");
  }
  if (!columns.some((c) => c.name === 'name')) {
    db.exec('ALTER TABLE todos ADD COLUMN name TEXT');
  }

  const messageColumns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  if (!messageColumns.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN project_id TEXT');
  }

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  if (!sessionColumns.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT');
  }

  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
  if (!taskColumns.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN project_id TEXT');
  }

  const sprintColumns = db.prepare('PRAGMA table_info(sprints)').all() as Array<{ name: string }>;
  if (!sprintColumns.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE sprints ADD COLUMN project_id TEXT');
  }

  const todoCommentColumns = db.prepare('PRAGMA table_info(todo_comments)').all() as Array<{ name: string }>;
  if (!todoCommentColumns.some((c) => c.name === 'project_id')) {
    db.exec('ALTER TABLE todo_comments ADD COLUMN project_id TEXT');
  }

  const alertRuleColumns = db.prepare('PRAGMA table_info(alert_rules)').all() as Array<{ name: string }>;
  if (alertRuleColumns.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        priority_filter TEXT NOT NULL DEFAULT 'all',
        delay_ms INTEGER NOT NULL DEFAULT 0,
        channel TEXT NOT NULL DEFAULT 'in_app',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  } else {
    if (!alertRuleColumns.some((c) => c.name === 'priority_filter')) {
      db.exec("ALTER TABLE alert_rules ADD COLUMN priority_filter TEXT NOT NULL DEFAULT 'all'");
    }
    if (!alertRuleColumns.some((c) => c.name === 'delay_ms')) {
      db.exec("ALTER TABLE alert_rules ADD COLUMN delay_ms INTEGER NOT NULL DEFAULT 0");
    }
    if (!alertRuleColumns.some((c) => c.name === 'channel')) {
      db.exec("ALTER TABLE alert_rules ADD COLUMN channel TEXT NOT NULL DEFAULT 'in_app'");
    }
    if (!alertRuleColumns.some((c) => c.name === 'enabled')) {
      db.exec("ALTER TABLE alert_rules ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
    }
    if (!alertRuleColumns.some((c) => c.name === 'created_at')) {
      db.exec('ALTER TABLE alert_rules ADD COLUMN created_at INTEGER NOT NULL DEFAULT (unixepoch())');
    }
    if (!alertRuleColumns.some((c) => c.name === 'updated_at')) {
      db.exec('ALTER TABLE alert_rules ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())');
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_sprints_project_id ON sprints(project_id);
    CREATE INDEX IF NOT EXISTS idx_alert_rules_trigger ON alert_rules(trigger);
  `);

  const alertRulesCountRow = db.prepare('SELECT COUNT(*) as count FROM alert_rules').get() as { count: number };
  if ((alertRulesCountRow?.count ?? 0) === 0) {
    const seedStmt = db.prepare(`
      INSERT OR IGNORE INTO alert_rules (id, trigger, priority_filter, delay_ms, channel, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `);

    const defaultRules: Array<[
      string,
      'blocked' | 'completed' | 'error' | 'idle_too_long' | 'stale_task',
      'high' | 'medium' | 'low' | 'all',
      number,
      'push' | 'in_app' | 'both',
      0 | 1,
    ]> = [
      ['blocked-high', 'blocked', 'high', 0, 'both', 1],
      ['blocked-medium', 'blocked', 'medium', 600000, 'both', 1],
      ['blocked-low', 'blocked', 'low', 3600000, 'in_app', 1],
      ['error-all', 'error', 'all', 0, 'both', 1],
      ['completed-high', 'completed', 'high', 0, 'in_app', 1],
      ['completed-batch', 'completed', 'all', 900000, 'in_app', 1],
      ['idle-all', 'idle_too_long', 'all', 1800000, 'in_app', 1],
      ['stale-all', 'stale_task', 'all', 7200000, 'push', 1],
    ];

    for (const [id, trigger, priorityFilter, delayMs, channel, enabled] of defaultRules) {
      seedStmt.run(id, trigger, priorityFilter, delayMs, channel, enabled);
    }
  }

  db.exec(`
    INSERT OR IGNORE INTO projects (id, name, created_at)
    SELECT DISTINCT project, project, unixepoch()
    FROM todos
    WHERE project IS NOT NULL AND project != '';
  `);

  return db;
}

function getDatabase(): Database.Database {
  if (!dbInstance) {
    dbInstance = initializeDatabase();
  }
  return dbInstance;
}

const db: DatabaseOperations = {
  createTodo(todo: Omit<Todo, 'created_at' | 'updated_at' | 'completed_at'>): Todo {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    if (todo.parent_id) {
      if (!db.getTodo(todo.parent_id)) {
        throw new Error(`Parent todo with id ${todo.parent_id} not found`);
      }
      if (db.hasCircularReference(todo.id, todo.parent_id)) {
        throw new Error('Circular todo parent relationship is not allowed');
      }
      const parentDepth = db.getTodoDepth(todo.parent_id);
      if (parentDepth + 1 > 3) {
        throw new Error('Maximum todo depth exceeded');
      }
    }

    const stmt = database.prepare(`
      INSERT INTO todos (id, name, session_id, content, status, priority, agent, project, parent_id, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const completedAt = todo.status === 'completed' ? now : null;

    stmt.run(
      todo.id,
      todo.name ?? null,
      todo.session_id,
      todo.content,
      todo.status,
      todo.priority,
      todo.agent,
      todo.project,
      todo.parent_id ?? null,
      completedAt,
      now,
      now
    );

    const historyStmt = database.prepare(`
      INSERT INTO todo_status_history (todo_id, old_status, new_status, changed_by, changed_at)
      VALUES (?, NULL, ?, ?, ?)
    `);
    historyStmt.run(todo.id, todo.status, todo.agent || null, now);

    return {
      ...todo,
      completed_at: completedAt,
      created_at: now,
      updated_at: now,
    };
  },

  getTodo(id: string): Todo | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM todos WHERE id = ?');
    return (stmt.get(id) as Todo) || null;
  },

  getAllTodos(): Todo[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM todos ORDER BY created_at DESC');
    return stmt.all() as Todo[];
  },

  getChildTodos(parentId: string): Todo[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY created_at DESC');
    return stmt.all(parentId) as Todo[];
  },

  getTodoDepth(id: string): number {
    let depth = 0;
    let currentTodo = db.getTodo(id);
    const visited = new Set<string>();

    while (currentTodo?.parent_id) {
      if (visited.has(currentTodo.id)) {
        break;
      }
      visited.add(currentTodo.id);
      const parentTodo = db.getTodo(currentTodo.parent_id);
      if (!parentTodo) {
        break;
      }
      depth += 1;
      currentTodo = parentTodo;
    }

    return depth;
  },

  hasCircularReference(childId: string, proposedParentId: string): boolean {
    if (childId === proposedParentId) {
      return true;
    }

    let currentId: string | null = proposedParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === childId || visited.has(currentId)) {
        return true;
      }
      visited.add(currentId);

      const currentTodo = db.getTodo(currentId);
      if (!currentTodo?.parent_id) {
        return false;
      }
      currentId = currentTodo.parent_id;
    }

    return false;
  },

  updateTodo(id: string, updates: Partial<Omit<Todo, 'id' | 'created_at'>>): Todo {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const todo = db.getTodo(id);
    if (!todo) {
      throw new Error(`Todo with id ${id} not found`);
    }

    const updated = { ...todo, ...updates, updated_at: now };

    const statusChanged = updates.status !== undefined && updates.status !== todo.status;

    if (statusChanged && updates.status) {
      const historyStmt = database.prepare(`
        INSERT INTO todo_status_history (todo_id, old_status, new_status, changed_by, changed_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      historyStmt.run(id, todo.status, updates.status, updates.agent || todo.agent || null, now);
    }

    if (updates.status === 'completed' && todo.status !== 'completed') {
      updated.completed_at = now;
    } else if (updates.status && updates.status !== 'completed' && todo.completed_at !== null) {
      updated.completed_at = null;
    }

    if (updated.parent_id) {
      if (!db.getTodo(updated.parent_id)) {
        throw new Error(`Parent todo with id ${updated.parent_id} not found`);
      }
      if (db.hasCircularReference(id, updated.parent_id)) {
        throw new Error('Circular todo parent relationship is not allowed');
      }
      const parentDepth = db.getTodoDepth(updated.parent_id);
      if (parentDepth + 1 > 3) {
        throw new Error('Maximum todo depth exceeded');
      }
    }

    const stmt = database.prepare(`
      UPDATE todos
      SET name = ?, session_id = ?, content = ?, status = ?, priority = ?, agent = ?, project = ?, parent_id = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name ?? null,
      updated.session_id,
      updated.content,
      updated.status,
      updated.priority,
      updated.agent,
      updated.project,
      updated.parent_id ?? null,
      updated.completed_at,
      now,
      id
    );

    return updated;
  },

  logStatusChange(entry: Omit<StatusHistoryEntry, 'id'>): StatusHistoryEntry {
    const database = getDatabase();
    const stmt = database.prepare(`
      INSERT INTO todo_status_history (todo_id, old_status, new_status, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(entry.todo_id, entry.old_status, entry.new_status, entry.changed_by, entry.changed_at);

    return {
      ...entry,
      id: Number(result.lastInsertRowid),
    };
  },

  getStatusHistory(todoId: string): StatusHistoryEntry[] {
    const database = getDatabase();
    const stmt = database.prepare(
      'SELECT * FROM todo_status_history WHERE todo_id = ? ORDER BY changed_at ASC, id ASC'
    );
    return stmt.all(todoId) as StatusHistoryEntry[];
  },

  getStatusHistoryInRange(startTime: number, endTime: number): StatusHistoryEntry[] {
    const database = getDatabase();
    const stmt = database.prepare(
      'SELECT * FROM todo_status_history WHERE changed_at >= ? AND changed_at <= ? ORDER BY changed_at ASC, id ASC'
    );
    return stmt.all(startTime, endTime) as StatusHistoryEntry[];
  },

  getCompletedTodosInRange(startTime: number, endTime: number): Todo[] {
    const database = getDatabase();
    const stmt = database.prepare(
      'SELECT * FROM todos WHERE completed_at >= ? AND completed_at <= ? ORDER BY completed_at ASC, id ASC'
    );
    return stmt.all(startTime, endTime) as Todo[];
  },

  deleteTodo(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM todos WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createComment(comment: Omit<TodoComment, 'id' | 'created_at'>): TodoComment {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO todo_comments (todo_id, body, author, project_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(comment.todo_id, comment.body, comment.author, comment.project_id ?? null, now);

    return {
      ...comment,
      id: Number(result.lastInsertRowid),
      created_at: now,
    };
  },

  getComments(todoId: string): TodoComment[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM todo_comments WHERE todo_id = ? ORDER BY created_at ASC');
    return stmt.all(todoId) as TodoComment[];
  },

  deleteComment(id: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM todo_comments WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  getCommentCounts(): Record<string, number> {
    const database = getDatabase();
    const stmt = database.prepare('SELECT todo_id, COUNT(*) as count FROM todo_comments GROUP BY todo_id');
    const rows = stmt.all() as Array<{ todo_id: string; count: number }>;

    return rows.reduce(
      (acc, row) => {
        acc[row.todo_id] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );
  },

  createSprint(sprint: Omit<Sprint, 'created_at' | 'updated_at'>): Sprint {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO sprints (id, name, start_date, end_date, goal, status, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      sprint.id,
      sprint.name,
      sprint.start_date,
      sprint.end_date,
      sprint.goal,
      sprint.status,
      sprint.project_id ?? null,
      now,
      now
    );

    return {
      ...sprint,
      created_at: now,
      updated_at: now,
    };
  },

  getSprint(id: string): Sprint | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM sprints WHERE id = ?');
    return (stmt.get(id) as Sprint) || null;
  },

  getAllSprints(): Sprint[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM sprints ORDER BY start_date DESC, created_at DESC');
    return stmt.all() as Sprint[];
  },

  updateSprint(id: string, updates: Partial<Omit<Sprint, 'id' | 'created_at'>>): Sprint {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const sprint = db.getSprint(id);
    if (!sprint) {
      throw new Error(`Sprint with id ${id} not found`);
    }

    const updated: Sprint = { ...sprint, ...updates, updated_at: now };

    const stmt = database.prepare(`
      UPDATE sprints
      SET name = ?, start_date = ?, end_date = ?, goal = ?, status = ?, project_id = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updated.name, updated.start_date, updated.end_date, updated.goal, updated.status, updated.project_id ?? null, now, id);

    return updated;
  },

  assignTodoToSprint(todoId: string, sprintId: string): void {
    const database = getDatabase();

    const todo = db.getTodo(todoId);
    if (!todo) {
      throw new Error(`Todo with id ${todoId} not found`);
    }

    const sprint = db.getSprint(sprintId);
    if (!sprint) {
      throw new Error(`Sprint with id ${sprintId} not found`);
    }

    const stmt = database.prepare(`
      INSERT INTO todo_sprints (todo_id, sprint_id)
      VALUES (?, ?)
      ON CONFLICT(todo_id, sprint_id) DO NOTHING
    `);

    stmt.run(todoId, sprintId);
  },

  removeTodoFromSprint(todoId: string, sprintId: string): void {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM todo_sprints WHERE todo_id = ? AND sprint_id = ?');
    stmt.run(todoId, sprintId);
  },

  getSprintTodos(sprintId: string): Todo[] {
    const database = getDatabase();
    const stmt = database.prepare(`
      SELECT t.*
      FROM todos t
      INNER JOIN todo_sprints ts ON ts.todo_id = t.id
      WHERE ts.sprint_id = ?
      ORDER BY t.created_at DESC
    `);

    return stmt.all(sprintId) as Todo[];
  },

  getTodoSprints(todoId: string): Sprint[] {
    const database = getDatabase();
    const stmt = database.prepare(`
      SELECT s.*
      FROM sprints s
      INNER JOIN todo_sprints ts ON ts.sprint_id = s.id
      WHERE ts.todo_id = ?
      ORDER BY s.start_date DESC, s.created_at DESC
    `);

    return stmt.all(todoId) as Sprint[];
  },

  getTodoSprintMap(): Map<string, Array<{ id: string; name: string }>> {
    const database = getDatabase();
    const stmt = database.prepare(`
      SELECT ts.todo_id, s.id, s.name
      FROM todo_sprints ts
      INNER JOIN sprints s ON s.id = ts.sprint_id
      ORDER BY s.start_date DESC
    `);
    const rows = stmt.all() as Array<{ todo_id: string; id: string; name: string }>;
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of rows) {
      const existing = map.get(row.todo_id) || [];
      existing.push({ id: row.id, name: row.name });
      map.set(row.todo_id, existing);
    }
    return map;
  },

  getSprintVelocity(sprintId: string): SprintVelocity {
    const sprint = db.getSprint(sprintId);
    if (!sprint) {
      throw new Error(`Sprint with id ${sprintId} not found`);
    }

    const todos = db.getSprintTodos(sprintId);
    const priorityPoints: Record<Todo['priority'], number> = {
      low: 1,
      medium: 3,
      high: 5,
    };

    const totalPoints = todos.reduce((sum, todo) => sum + priorityPoints[todo.priority], 0);
    const completedPoints = todos.reduce(
      (sum, todo) => sum + (todo.status === 'completed' ? priorityPoints[todo.priority] : 0),
      0
    );

    const startDate = new Date(sprint.start_date * 1000);
    startDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(Math.min(Math.floor(Date.now() / 1000), sprint.end_date) * 1000);
    endDate.setUTCHours(0, 0, 0, 0);

    const completedTodos = todos
      .filter((todo) => todo.status === 'completed')
      .map((todo) => ({
        points: priorityPoints[todo.priority],
        completedAt: todo.updated_at,
      }));

    const daily_progress: Array<{ date: string; completed: number; remaining: number }> = [];

    for (let current = new Date(startDate); current.getTime() <= endDate.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
      const dayEndTimestamp = Math.floor(current.getTime() / 1000) + 86399;
      const cumulativeCompleted = completedTodos.reduce(
        (sum, todo) => sum + (todo.completedAt <= dayEndTimestamp ? todo.points : 0),
        0
      );

      daily_progress.push({
        date: current.toISOString().slice(0, 10),
        completed: cumulativeCompleted,
        remaining: Math.max(totalPoints - cumulativeCompleted, 0),
      });
    }

    return {
      sprint_id: sprint.id,
      sprint_name: sprint.name,
      total_points: totalPoints,
      completed_points: completedPoints,
      daily_progress,
    };
  },

  getActiveSprint(): Sprint | null {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const stmt = database.prepare('SELECT * FROM sprints WHERE status = ? ORDER BY start_date ASC, created_at ASC');
    const activeSprints = stmt.all('active') as Sprint[];

    return activeSprints.find((sprint) => sprint.start_date <= now && now <= sprint.end_date) ?? null;
  },

  createMessage(message: Omit<Message, 'id' | 'created_at'>): Message {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const encryptedContent = encrypt(message.content);

    const stmt = database.prepare(`
      INSERT INTO messages (type, content, todo_id, session_id, project_id, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.type,
      encryptedContent,
      message.todo_id,
      message.session_id,
      message.project_id ?? null,
      message.read,
      now
    );

    return {
      ...message,
      id: (result.lastInsertRowid as number) || 0,
      created_at: now,
      content: message.content,
    };
  },

  getMessage(id: number): Message | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return {
      ...row,
      content: decrypt(row.content),
    };
  },

  getMessages(filters?: {
    todo_id?: string;
    session_id?: string;
    read?: boolean;
  }): Message[] {
    const database = getDatabase();

    let query = 'SELECT * FROM messages WHERE 1=1';
    const params: any[] = [];

    if (filters?.todo_id) {
      query += ' AND todo_id = ?';
      params.push(filters.todo_id);
    }

    if (filters?.session_id) {
      query += ' AND session_id = ?';
      params.push(filters.session_id);
    }

    if (filters?.read !== undefined) {
      query += ' AND read = ?';
      params.push(filters.read ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = database.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      ...row,
      content: decrypt(row.content),
    }));
  },

  markMessageAsRead(id: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('UPDATE messages SET read = 1 WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  deleteMessage(id: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO users (github_id, username, display_name, avatar_url, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(user.github_id, user.username, user.display_name, user.avatar_url, user.role, now, now);

    return {
      ...user,
      id: Number(result.lastInsertRowid),
      created_at: now,
      updated_at: now,
    };
  },

  getUserById(id: number): User | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
    return (stmt.get(id) as User) || null;
  },

  getUserByGithubId(githubId: number): User | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM users WHERE github_id = ?');
    return (stmt.get(githubId) as User) || null;
  },

  getAllUsers(): User[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC');
    return stmt.all() as User[];
  },

  updateUser(id: number, updates: Partial<Omit<User, 'id' | 'created_at'>>): User {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const user = db.getUserById(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }

    const updated: User = { ...user, ...updates, updated_at: now };

    const stmt = database.prepare(`
      UPDATE users
      SET github_id = ?, username = ?, display_name = ?, avatar_url = ?, role = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updated.github_id, updated.username, updated.display_name, updated.avatar_url, updated.role, now, id);

    return updated;
  },

  deleteUser(id: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  getUserCount(): number {
    const database = getDatabase();
    const stmt = database.prepare('SELECT COUNT(*) as count FROM users');
    const row = stmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
  },

  createAuthSession(session: Omit<AuthSession, 'created_at'>): AuthSession {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(session.id, session.user_id, session.token_hash, session.expires_at, now);

    return {
      ...session,
      created_at: now,
    };
  },

  getAuthSessionByTokenHash(tokenHash: string): AuthSession | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?');
    return (stmt.get(tokenHash) as AuthSession) || null;
  },

  deleteAuthSession(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM auth_sessions WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  deleteUserSessions(userId: number): number {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM auth_sessions WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes ?? 0;
  },

  cleanExpiredSessions(): number {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const stmt = database.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?');
    const result = stmt.run(now);
    return result.changes ?? 0;
  },

  createInviteLink(link: Omit<InviteLink, 'used_by' | 'used_at' | 'created_at'>): InviteLink {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO invite_links (id, created_by, role, expires_at, used_by, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, NULL, ?)
    `);

    stmt.run(link.id, link.created_by, link.role, link.expires_at, now);

    return {
      ...link,
      used_by: null,
      used_at: null,
      created_at: now,
    };
  },

  getInviteLink(id: string): InviteLink | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM invite_links WHERE id = ?');
    return (stmt.get(id) as InviteLink) || null;
  },

  markInviteLinkUsed(id: string, usedBy: number): boolean {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const stmt = database.prepare('UPDATE invite_links SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL');
    const result = stmt.run(usedBy, now, id);
    return (result.changes ?? 0) > 0;
  },

  createProject(project: Omit<Project, 'created_at'>): Project {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO projects (id, name, description, color, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(project.id, project.name, project.description, project.color, now);

    return {
      ...project,
      created_at: now,
    };
  },

  getProject(id: string): Project | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM projects WHERE id = ?');
    return (stmt.get(id) as Project) || null;
  },

  getAllProjects(): Project[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM projects ORDER BY created_at DESC, id DESC');
    return stmt.all() as Project[];
  },

  updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>): Project {
    const database = getDatabase();

    const project = db.getProject(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }

    const updated: Project = { ...project, ...updates };

    const stmt = database.prepare(`
      UPDATE projects
      SET name = ?, description = ?, color = ?
      WHERE id = ?
    `);

    stmt.run(updated.name, updated.description, updated.color, id);

    return updated;
  },

  deleteProject(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createSession(session: Omit<Session, 'started_at'>): Session {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO sessions (id, name, started_at, ended_at, project_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(session.id, session.name, now, session.ended_at, session.project_id ?? null);

    return {
      ...session,
      started_at: now,
    };
  },

  getSession(id: string): Session | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM sessions WHERE id = ?');
    return (stmt.get(id) as Session) || null;
  },

  getAllSessions(): Session[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM sessions ORDER BY started_at DESC');
    return stmt.all() as Session[];
  },

  endSession(id: string): Session | null {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const session = db.getSession(id);
    if (!session) {
      return null;
    }

    const stmt = database.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?');
    stmt.run(now, id);

    return {
      ...session,
      ended_at: now,
    };
  },

  getSetting(key: string): string | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as any;
    return row?.value || null;
  },

  setSetting(key: string, value: string): void {
    const database = getDatabase();
    const stmt = database.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  },

  getAllSettings(): Record<string, string> {
    const database = getDatabase();
    const stmt = database.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as Setting[];
    return rows.reduce(
      (acc, row) => {
        acc[row.key] = row.value;
        return acc;
      },
      {} as Record<string, string>
    );
  },

  createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Task {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO tasks (
        tag,
        title,
        description,
        status,
        priority,
        dependencies,
        details,
        test_strategy,
        complexity_score,
        assigned_agent_id,
        linear_issue_id,
        project_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      task.tag,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.dependencies,
      task.details,
      task.test_strategy,
      task.complexity_score,
      task.assigned_agent_id,
      task.linear_issue_id,
      task.project_id ?? null,
      now,
      now
    );

    return {
      ...task,
      id: Number(result.lastInsertRowid),
      created_at: now,
      updated_at: now,
    };
  },

  getTask(id: number): Task | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM tasks WHERE id = ?');
    return (stmt.get(id) as Task) || null;
  },

  getAllTasks(tag?: string): Task[] {
    const database = getDatabase();
    if (tag) {
      const stmt = database.prepare('SELECT * FROM tasks WHERE tag = ? ORDER BY updated_at DESC');
      return stmt.all(tag) as Task[];
    }

    const stmt = database.prepare('SELECT * FROM tasks ORDER BY updated_at DESC');
    return stmt.all() as Task[];
  },

  updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'created_at'>>): Task {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const task = db.getTask(id);
    if (!task) {
      throw new Error(`Task with id ${id} not found`);
    }

    const updated: Task = { ...task, ...updates, updated_at: now };

    const stmt = database.prepare(`
      UPDATE tasks
      SET
        tag = ?,
        title = ?,
        description = ?,
        status = ?,
        priority = ?,
        dependencies = ?,
        details = ?,
        test_strategy = ?,
        complexity_score = ?,
        assigned_agent_id = ?,
        linear_issue_id = ?,
        project_id = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.tag,
      updated.title,
      updated.description,
      updated.status,
      updated.priority,
      updated.dependencies,
      updated.details,
      updated.test_strategy,
      updated.complexity_score,
      updated.assigned_agent_id,
      updated.linear_issue_id,
      updated.project_id ?? null,
      now,
      id
    );

    return updated;
  },

  deleteTask(id: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createSubtask(subtask: Omit<Subtask, 'created_at'>): Subtask {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO subtasks (
        id,
        task_id,
        title,
        description,
        status,
        dependencies,
        details,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      subtask.id,
      subtask.task_id,
      subtask.title,
      subtask.description,
      subtask.status,
      subtask.dependencies,
      subtask.details,
      now
    );

    return {
      ...subtask,
      created_at: now,
    };
  },

  getSubtasks(taskId: number): Subtask[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY id ASC');
    return stmt.all(taskId) as Subtask[];
  },

  updateSubtask(
    taskId: number,
    subtaskId: number,
    updates: Partial<Omit<Subtask, 'task_id' | 'id' | 'created_at'>>
  ): Subtask {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM subtasks WHERE task_id = ? AND id = ?');
    const subtask = (stmt.get(taskId, subtaskId) as Subtask) || null;

    if (!subtask) {
      throw new Error(`Subtask ${subtaskId} for task ${taskId} not found`);
    }

    const updated: Subtask = { ...subtask, ...updates };

    const updateStmt = database.prepare(`
      UPDATE subtasks
      SET
        title = ?,
        description = ?,
        status = ?,
        dependencies = ?,
        details = ?
      WHERE task_id = ? AND id = ?
    `);

    updateStmt.run(
      updated.title,
      updated.description,
      updated.status,
      updated.dependencies,
      updated.details,
      taskId,
      subtaskId
    );

    return updated;
  },

  deleteSubtask(taskId: number, subtaskId: number): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM subtasks WHERE task_id = ? AND id = ?');
    const result = stmt.run(taskId, subtaskId);
    return (result.changes ?? 0) > 0;
  },

  getNextTask(tag?: string): Task | null {
    const tasks = db.getAllTasks(tag);
    const taskMap = new Map<number, Task>(tasks.map((task) => [task.id, task]));
    const priorityRank: Record<Task['priority'], number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    const pendingTasks = tasks
      .filter((task) => task.status === 'pending')
      .filter((task) => {
        if (!task.dependencies) {
          return true;
        }

        try {
          const dependencyIds = JSON.parse(task.dependencies) as unknown;
          if (!Array.isArray(dependencyIds)) {
            return true;
          }

          return dependencyIds.every((depId) => {
            const numericDepId = Number(depId);
            if (!Number.isFinite(numericDepId)) {
              return false;
            }
            const dependencyTask = taskMap.get(numericDepId);
            return dependencyTask?.status === 'done';
          });
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        const priorityDiff = priorityRank[b.priority] - priorityRank[a.priority];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        if (a.created_at !== b.created_at) {
          return a.created_at - b.created_at;
        }
        return a.id - b.id;
      });

    return pendingTasks[0] || null;
  },

  getTaskTags(): string[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT DISTINCT tag FROM tasks WHERE tag IS NOT NULL AND tag != "" ORDER BY tag ASC');
    const rows = stmt.all() as Array<{ tag: string }>;
    return rows.map((row) => row.tag);
  },

  createAgent(agent: Omit<Agent, 'created_at'>): Agent {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO agents (
        id,
        name,
        type,
        parent_agent_id,
        status,
        soul_md,
        skills,
        current_task_id,
        created_at,
        last_heartbeat,
        config
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agent.id,
      agent.name,
      agent.type,
      agent.parent_agent_id,
      agent.status,
      agent.soul_md,
      agent.skills,
      agent.current_task_id,
      now,
      agent.last_heartbeat,
      agent.config
    );

    return {
      ...agent,
      created_at: now,
    };
  },

  getAgent(id: string): Agent | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM agents WHERE id = ?');
    return (stmt.get(id) as Agent) || null;
  },

  getAllAgents(filters?: { status?: string; type?: string; parent_agent_id?: string }): Agent[] {
    const database = getDatabase();

    let query = 'SELECT * FROM agents WHERE 1=1';
    const params: string[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.parent_agent_id) {
      query += ' AND parent_agent_id = ?';
      params.push(filters.parent_agent_id);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = database.prepare(query);
    return stmt.all(...params) as Agent[];
  },

  updateAgent(id: string, updates: Partial<Omit<Agent, 'id' | 'created_at'>>): Agent {
    const database = getDatabase();

    const agent = db.getAgent(id);
    if (!agent) {
      throw new Error(`Agent with id ${id} not found`);
    }

    const updated: Agent = { ...agent, ...updates };

    const stmt = database.prepare(`
      UPDATE agents
      SET
        name = ?,
        type = ?,
        parent_agent_id = ?,
        status = ?,
        soul_md = ?,
        skills = ?,
        current_task_id = ?,
        last_heartbeat = ?,
        config = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.type,
      updated.parent_agent_id,
      updated.status,
      updated.soul_md,
      updated.skills,
      updated.current_task_id,
      updated.last_heartbeat,
      updated.config,
      id
    );

    return updated;
  },

  deleteAgent(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM agents WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createAgentTask(task: Omit<AgentTask, 'created_at' | 'updated_at'>): AgentTask {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO agent_tasks (
        id,
        agent_id,
        linear_issue_id,
        project_id,
        title,
        status,
        priority,
        blocked_reason,
        blocked_at,
        started_at,
        completed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.agent_id,
      task.linear_issue_id,
      task.project_id,
      task.title,
      task.status,
      task.priority,
      task.blocked_reason,
      task.blocked_at,
      task.started_at,
      task.completed_at,
      now,
      now
    );

    return {
      ...task,
      created_at: now,
      updated_at: now,
    };
  },

  getAgentTask(id: string): AgentTask | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM agent_tasks WHERE id = ?');
    return (stmt.get(id) as AgentTask) || null;
  },

  getAgentTasks(agentId: string): AgentTask[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM agent_tasks WHERE agent_id = ? ORDER BY created_at DESC');
    return stmt.all(agentId) as AgentTask[];
  },

  updateAgentTask(id: string, updates: Partial<Omit<AgentTask, 'id' | 'agent_id' | 'created_at'>>): AgentTask {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const task = db.getAgentTask(id);
    if (!task) {
      throw new Error(`Agent task with id ${id} not found`);
    }

    const updated: AgentTask = { ...task, ...updates, updated_at: now };

    const stmt = database.prepare(`
      UPDATE agent_tasks
      SET
        linear_issue_id = ?,
        project_id = ?,
        title = ?,
        status = ?,
        priority = ?,
        blocked_reason = ?,
        blocked_at = ?,
        started_at = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.linear_issue_id,
      updated.project_id,
      updated.title,
      updated.status,
      updated.priority,
      updated.blocked_reason,
      updated.blocked_at,
      updated.started_at,
      updated.completed_at,
      now,
      id
    );

    return updated;
  },

  deleteAgentTask(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM agent_tasks WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  createAlertRule(rule: Omit<AlertRule, 'created_at' | 'updated_at'>): AlertRule {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO alert_rules (id, trigger, priority_filter, delay_ms, channel, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(rule.id, rule.trigger, rule.priority_filter, rule.delay_ms, rule.channel, rule.enabled, now, now);

    return {
      ...rule,
      created_at: now,
      updated_at: now,
    };
  },

  getAlertRule(id: string): AlertRule | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM alert_rules WHERE id = ?');
    return (stmt.get(id) as AlertRule) || null;
  },

  getAllAlertRules(): AlertRule[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM alert_rules ORDER BY trigger ASC, delay_ms ASC, id ASC');
    return stmt.all() as AlertRule[];
  },

  updateAlertRule(id: string, updates: Partial<Omit<AlertRule, 'id' | 'created_at'>>): AlertRule {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const rule = db.getAlertRule(id);
    if (!rule) {
      throw new Error(`Alert rule with id ${id} not found`);
    }

    const updated: AlertRule = { ...rule, ...updates, updated_at: now };

    const stmt = database.prepare(`
      UPDATE alert_rules
      SET trigger = ?, priority_filter = ?, delay_ms = ?, channel = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updated.trigger, updated.priority_filter, updated.delay_ms, updated.channel, updated.enabled, now, id);

    return updated;
  },

  deleteAlertRule(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM alert_rules WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  getAlertRulesForTrigger(trigger: string, priority?: string): AlertRule[] {
    const database = getDatabase();

    if (priority) {
      const stmt = database.prepare(`
        SELECT *
        FROM alert_rules
        WHERE trigger = ?
          AND (priority_filter = 'all' OR priority_filter = ?)
        ORDER BY delay_ms ASC, id ASC
      `);
      return stmt.all(trigger, priority) as AlertRule[];
    }

    const stmt = database.prepare('SELECT * FROM alert_rules WHERE trigger = ? ORDER BY delay_ms ASC, id ASC');
    return stmt.all(trigger) as AlertRule[];
  },

  upsertLinearProject(project: LinearProject): LinearProject {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const syncedAt = project.synced_at || now;

    const stmt = database.prepare(`
      INSERT INTO linear_projects (
        id,
        name,
        description,
        state,
        progress,
        start_date,
        target_date,
        url,
        team_id,
        team_name,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        state = excluded.state,
        progress = excluded.progress,
        start_date = excluded.start_date,
        target_date = excluded.target_date,
        url = excluded.url,
        team_id = excluded.team_id,
        team_name = excluded.team_name,
        synced_at = excluded.synced_at
    `);

    stmt.run(
      project.id,
      project.name,
      project.description,
      project.state,
      project.progress,
      project.start_date,
      project.target_date,
      project.url,
      project.team_id,
      project.team_name,
      syncedAt
    );

    return {
      ...project,
      synced_at: syncedAt,
    };
  },

  getLinearProject(id: string): LinearProject | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_projects WHERE id = ?');
    return (stmt.get(id) as LinearProject) || null;
  },

  getAllLinearProjects(): LinearProject[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_projects ORDER BY synced_at DESC, id DESC');
    return stmt.all() as LinearProject[];
  },

  deleteLinearProject(id: string): boolean {
    const database = getDatabase();
    const detachIssuesStmt = database.prepare('UPDATE linear_issues SET project_id = NULL WHERE project_id = ?');
    detachIssuesStmt.run(id);
    const stmt = database.prepare('DELETE FROM linear_projects WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  upsertLinearIssue(issue: LinearIssue): LinearIssue {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const syncedAt = issue.synced_at || now;

    const stmt = database.prepare(`
      INSERT INTO linear_issues (
        id,
        project_id,
        identifier,
        title,
        description,
        priority,
        state_name,
        state_type,
        assignee_name,
        assignee_avatar,
        label_names,
        estimate,
        url,
        agent_task_id,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        identifier = excluded.identifier,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        state_name = excluded.state_name,
        state_type = excluded.state_type,
        assignee_name = excluded.assignee_name,
        assignee_avatar = excluded.assignee_avatar,
        label_names = excluded.label_names,
        estimate = excluded.estimate,
        url = excluded.url,
        agent_task_id = excluded.agent_task_id,
        synced_at = excluded.synced_at
    `);

    stmt.run(
      issue.id,
      issue.project_id,
      issue.identifier,
      issue.title,
      issue.description,
      issue.priority,
      issue.state_name,
      issue.state_type,
      issue.assignee_name,
      issue.assignee_avatar,
      issue.label_names,
      issue.estimate,
      issue.url,
      issue.agent_task_id,
      syncedAt
    );

    return {
      ...issue,
      synced_at: syncedAt,
    };
  },

  getLinearIssue(id: string): LinearIssue | null {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_issues WHERE id = ?');
    return (stmt.get(id) as LinearIssue) || null;
  },

  getLinearIssuesByProject(projectId: string): LinearIssue[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_issues WHERE project_id = ? ORDER BY synced_at DESC, id DESC');
    return stmt.all(projectId) as LinearIssue[];
  },

  getAllLinearIssues(): LinearIssue[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_issues ORDER BY synced_at DESC, id DESC');
    return stmt.all() as LinearIssue[];
  },

  deleteLinearIssue(id: string): boolean {
    const database = getDatabase();
    const stmt = database.prepare('DELETE FROM linear_issues WHERE id = ?');
    const result = stmt.run(id);
    return (result.changes ?? 0) > 0;
  },

  linkAgentToIssue(issueId: string, agentTaskId: string | null): boolean {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const stmt = database.prepare('UPDATE linear_issues SET agent_task_id = ?, synced_at = ? WHERE id = ?');
    const result = stmt.run(agentTaskId, now, issueId);
    return (result.changes ?? 0) > 0;
  },

  upsertLinearWorkflowState(state: LinearWorkflowState): LinearWorkflowState {
    const database = getDatabase();
    const stmt = database.prepare(`
      INSERT INTO linear_workflow_states (
        id,
        team_id,
        name,
        type,
        color,
        position
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        team_id = excluded.team_id,
        name = excluded.name,
        type = excluded.type,
        color = excluded.color,
        position = excluded.position
    `);

    stmt.run(state.id, state.team_id, state.name, state.type, state.color, state.position);

    return state;
  },

  getLinearWorkflowStates(teamId: string): LinearWorkflowState[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_workflow_states WHERE team_id = ? ORDER BY position ASC, name ASC');
    return stmt.all(teamId) as LinearWorkflowState[];
  },

  getAllLinearWorkflowStates(): LinearWorkflowState[] {
    const database = getDatabase();
    const stmt = database.prepare('SELECT * FROM linear_workflow_states ORDER BY team_id ASC, position ASC, name ASC');
    return stmt.all() as LinearWorkflowState[];
  },

  close(): void {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  },
};

export default db;
export type {
  Todo,
  Message,
  Session,
  Setting,
  Task,
  Subtask,
  TodoComment,
  Sprint,
  SprintVelocity,
  User,
  AuthSession,
  InviteLink,
  Project,
  Agent,
  AgentTask,
  AlertRule,
  LinearProject,
  LinearIssue,
  LinearWorkflowState,
  StatusHistoryEntry,
  DatabaseOperations,
};
