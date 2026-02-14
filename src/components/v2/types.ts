import type { Task as DbTask, Subtask as DbSubtask } from '@/lib/db/types';

export type V2Task = DbTask & {
  source?: 'v1' | 'v2';
  original_id?: string;
};

export type Task = V2Task;
export type Subtask = DbSubtask;

export type BoardStatus = 'pending' | 'in_progress' | 'blocked' | 'review' | 'done';

export interface TaskBoardProps {
  tasks: V2Task[];
  subtasks: Record<number, Subtask[]>;
  onStatusChange: (id: number, status: V2Task['status']) => void;
  onSelectTask: (task: V2Task) => void;
  isLoading?: boolean;
}

export interface TaskColumnProps {
  status: BoardStatus;
  tasks: V2Task[];
  subtasks: Record<number, Subtask[]>;
  onSelectTask: (task: V2Task) => void;
}

export interface TaskCardProps {
  task: V2Task;
  subtasks: Subtask[];
  onClick: (task: V2Task) => void;
  isDragging?: boolean;
}

export interface NewTaskModalProps {
  open: boolean;
  activeTag: string;
  tasks: V2Task[];
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string | null;
    priority?: V2Task['priority'];
    tag?: string;
    dependencies?: number[];
  }) => Promise<void>;
}

export interface TaskDetailModalProps {
  open: boolean;
  task: V2Task | null;
  tasks: V2Task[];
  subtasks: Subtask[];
  onClose: () => void;
  onSave: (taskId: number, updates: Partial<V2Task>) => Promise<void>;
  onDelete: (taskId: number, originalId?: string) => Promise<void>;
  onFetchSubtasks: (taskId: number) => Promise<void>;
  onCreateSubtask: (taskId: number, data: {
    title: string;
    description?: string | null;
    status?: Subtask['status'];
    dependencies?: number[];
    details?: string | null;
  }) => Promise<void>;
  onUpdateSubtask: (
    taskId: number,
    subtaskId: number,
    updates: Partial<Subtask>
  ) => Promise<void>;
  onDeleteSubtask: (taskId: number, subtaskId: number) => Promise<void>;
}

export interface TagSwitcherProps {
  tags: string[];
  activeTag: string;
  onChangeTag: (tag: string) => void;
  onCreateTag: (tag: string) => void;
}

export interface NextTaskPanelProps {
  task: V2Task | null;
  onStartWorking: (task: V2Task) => Promise<void>;
  onOpenTask: (task: V2Task) => void;
}
