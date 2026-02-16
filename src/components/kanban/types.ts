export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'icebox';
  priority: 'high' | 'medium' | 'low';
  agent?: string | null;
  project?: string | null;
  parent_id?: string | null;
  session_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface KanbanBoardProps {
  todos: Todo[];
  onStatusChange: (id: string, newStatus: Todo['status']) => void;
  isLoading?: boolean;
}

export interface KanbanColumnProps {
  title: string;
  status: Todo['status'];
  todos: Todo[];
  onStatusChange: (id: string, newStatus: Todo['status']) => void;
  childTodosMap: Map<string, Todo[]>;
  expandedParents: Set<string>;
  onToggleExpand: (parentId: string) => void;
}

export interface KanbanCardProps {
  todo: Todo;
  isDragging?: boolean;
  childCount?: number;
  isSubtask?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}
