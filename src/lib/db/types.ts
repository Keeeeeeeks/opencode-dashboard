/**
 * Database model types for OpenCode Dashboard
 */

export interface Todo {
  id: string;
  session_id: string | null;
  content: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'icebox';
  priority: 'low' | 'medium' | 'high';
  agent: string | null;
  project: string | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: number;
  type: 'task_complete' | 'error' | 'state_change' | 'custom' | 'worklog';
  content: string; // encrypted in database, decrypted when retrieved
  todo_id: string | null;
  session_id: string | null;
  read: 0 | 1;
  created_at: number;
}

export interface Session {
  id: string;
  name: string | null;
  started_at: number;
  ended_at: number | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Task {
  id: number;
  tag: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'deferred' | 'cancelled' | 'review';
  priority: 'high' | 'medium' | 'low';
  dependencies: string | null;
  details: string | null;
  test_strategy: string | null;
  complexity_score: number | null;
  assigned_agent_id: string | null;
  linear_issue_id: string | null;
  /** Distinguishes v1 legacy todos from native v2 tasks */
  source?: 'v1' | 'v2';
  /** Original V1 todo string ID (only present when source === 'v1') */
  original_id?: string;
  created_at: number;
  updated_at: number;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  dependencies: string | null;
  details: string | null;
  created_at: number;
}

/**
 * Database operations interface
 */
export interface DatabaseOperations {
  // Todo operations
  createTodo(todo: Omit<Todo, 'created_at' | 'updated_at'>): Todo;
  getTodo(id: string): Todo | null;
  getAllTodos(): Todo[];
  updateTodo(id: string, updates: Partial<Omit<Todo, 'id' | 'created_at'>>): Todo;
  deleteTodo(id: string): boolean;

  // Message operations
  createMessage(message: Omit<Message, 'id' | 'created_at'>): Message;
  getMessage(id: number): Message | null;
  getMessages(filters?: { todo_id?: string; session_id?: string; read?: boolean }): Message[];
  markMessageAsRead(id: number): boolean;
  deleteMessage(id: number): boolean;

  // Session operations
  createSession(session: Omit<Session, 'started_at'>): Session;
  getSession(id: string): Session | null;
  getAllSessions(): Session[];
  endSession(id: string): Session | null;

  // Settings operations
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  getAllSettings(): Record<string, string>;

  createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Task;
  getTask(id: number): Task | null;
  getAllTasks(tag?: string): Task[];
  updateTask(id: number, updates: Partial<Omit<Task, 'id' | 'created_at'>>): Task;
  deleteTask(id: number): boolean;

  createSubtask(subtask: Omit<Subtask, 'created_at'>): Subtask;
  getSubtasks(taskId: number): Subtask[];
  updateSubtask(
    taskId: number,
    subtaskId: number,
    updates: Partial<Omit<Subtask, 'task_id' | 'id' | 'created_at'>>
  ): Subtask;
  deleteSubtask(taskId: number, subtaskId: number): boolean;

  getNextTask(tag?: string): Task | null;
  getTaskTags(): string[];

  // Database management
  close(): void;
}
