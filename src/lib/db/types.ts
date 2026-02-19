/**
 * Database model types for OpenCode Dashboard
 */

export interface Todo {
  id: string;
  name: string | null;
  session_id: string | null;
  content: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'icebox';
  priority: 'low' | 'medium' | 'high';
  agent: string | null;
  project: string | null;
  parent_id?: string | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface StatusHistoryEntry {
  id: number;
  todo_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  changed_at: number;
}

export interface Message {
  id: number;
  type: 'task_complete' | 'error' | 'state_change' | 'custom' | 'worklog';
  content: string; // encrypted in database, decrypted when retrieved
  todo_id: string | null;
  session_id: string | null;
  project_id?: string | null;
  read: 0 | 1;
  created_at: number;
}

export interface Session {
  id: string;
  name: string | null;
  started_at: number;
  ended_at: number | null;
  project_id?: string | null;
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
  project_id?: string | null;
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

export interface TodoComment {
  id: number;
  todo_id: string;
  body: string;
  author: string;
  project_id?: string | null;
  created_at: number;
}

export interface Sprint {
  id: string;
  name: string;
  start_date: number;
  end_date: number;
  goal: string | null;
  status: 'planning' | 'active' | 'completed';
  project_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface SprintVelocity {
  sprint_id: string;
  sprint_name: string;
  total_points: number;
  completed_points: number;
  daily_progress: Array<{ date: string; completed: number; remaining: number }>;
}

export interface User {
  id: number;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'viewer';
  created_at: number;
  updated_at: number;
}

export interface AuthSession {
  id: string;
  user_id: number;
  token_hash: string;
  expires_at: number;
  created_at: number;
}

export interface InviteLink {
  id: string;
  created_by: number;
  role: 'admin' | 'viewer';
  expires_at: number;
  used_by: number | null;
  used_at: number | null;
  created_at: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

/**
 * Database operations interface
 */
export interface DatabaseOperations {
  // Todo operations
  createTodo(todo: Omit<Todo, 'created_at' | 'updated_at' | 'completed_at'>): Todo;
  getTodo(id: string): Todo | null;
  getAllTodos(): Todo[];
  getChildTodos(parentId: string): Todo[];
  getTodoDepth(id: string): number;
  hasCircularReference(childId: string, proposedParentId: string): boolean;
  updateTodo(id: string, updates: Partial<Omit<Todo, 'id' | 'created_at'>>): Todo;
  deleteTodo(id: string): boolean;
  logStatusChange(entry: Omit<StatusHistoryEntry, 'id'>): StatusHistoryEntry;
  getStatusHistory(todoId: string): StatusHistoryEntry[];
  getStatusHistoryInRange(startTime: number, endTime: number): StatusHistoryEntry[];
  getCompletedTodosInRange(startTime: number, endTime: number): Todo[];

  createComment(comment: Omit<TodoComment, 'id' | 'created_at'>): TodoComment;
  getComments(todoId: string): TodoComment[];
  deleteComment(id: number): boolean;
  getCommentCounts(): Record<string, number>;

  createSprint(sprint: Omit<Sprint, 'created_at' | 'updated_at'>): Sprint;
  getSprint(id: string): Sprint | null;
  getAllSprints(): Sprint[];
  updateSprint(id: string, updates: Partial<Omit<Sprint, 'id' | 'created_at'>>): Sprint;
  assignTodoToSprint(todoId: string, sprintId: string): void;
  removeTodoFromSprint(todoId: string, sprintId: string): void;
  getSprintTodos(sprintId: string): Todo[];
  getTodoSprints(todoId: string): Sprint[];
  getTodoSprintMap(): Map<string, Array<{ id: string; name: string }>>;
  getSprintVelocity(sprintId: string): SprintVelocity;
  getActiveSprint(): Sprint | null;

  // Message operations
  createMessage(message: Omit<Message, 'id' | 'created_at'>): Message;
  getMessage(id: number): Message | null;
  getMessages(filters?: { todo_id?: string; session_id?: string; read?: boolean }): Message[];
  markMessageAsRead(id: number): boolean;
  deleteMessage(id: number): boolean;

  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User;
  getUserById(id: number): User | null;
  getUserByGithubId(githubId: number): User | null;
  getAllUsers(): User[];
  updateUser(id: number, updates: Partial<Omit<User, 'id' | 'created_at'>>): User;
  deleteUser(id: number): boolean;
  getUserCount(): number;

  createAuthSession(session: Omit<AuthSession, 'created_at'>): AuthSession;
  getAuthSessionByTokenHash(tokenHash: string): AuthSession | null;
  deleteAuthSession(id: string): boolean;
  deleteUserSessions(userId: number): number;
  cleanExpiredSessions(): number;

  createInviteLink(link: Omit<InviteLink, 'used_by' | 'used_at' | 'created_at'>): InviteLink;
  getInviteLink(id: string): InviteLink | null;
  markInviteLinkUsed(id: string, usedBy: number): boolean;

  createProject(project: Omit<Project, 'created_at'>): Project;
  getProject(id: string): Project | null;
  getAllProjects(): Project[];
  updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>): Project;
  deleteProject(id: string): boolean;

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
