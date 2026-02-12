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
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: number;
  type: 'task_complete' | 'error' | 'state_change' | 'custom';
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

  // Database management
  close(): void;
}
