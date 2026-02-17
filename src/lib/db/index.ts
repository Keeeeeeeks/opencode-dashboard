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
      read INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      started_at INTEGER DEFAULT (unixepoch()),
      ended_at INTEGER
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

    CREATE TABLE IF NOT EXISTS todo_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'anonymous',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      goal TEXT,
      status TEXT DEFAULT 'planning',
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
      INSERT INTO todos (id, session_id, content, status, priority, agent, project, parent_id, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const completedAt = todo.status === 'completed' ? now : null;

    stmt.run(
      todo.id,
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
      SET session_id = ?, content = ?, status = ?, priority = ?, agent = ?, project = ?, parent_id = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
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
      INSERT INTO todo_comments (todo_id, body, author, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(comment.todo_id, comment.body, comment.author, now);

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
      INSERT INTO sprints (id, name, start_date, end_date, goal, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(sprint.id, sprint.name, sprint.start_date, sprint.end_date, sprint.goal, sprint.status, now, now);

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
      SET name = ?, start_date = ?, end_date = ?, goal = ?, status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updated.name, updated.start_date, updated.end_date, updated.goal, updated.status, now, id);

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
      INSERT INTO messages (type, content, todo_id, session_id, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.type,
      encryptedContent,
      message.todo_id,
      message.session_id,
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

  createSession(session: Omit<Session, 'started_at'>): Session {
    const database = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO sessions (id, name, started_at, ended_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(session.id, session.name, now, session.ended_at);

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
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  StatusHistoryEntry,
  DatabaseOperations,
};
