import { create } from 'zustand';
import type { Task, Subtask } from '@/lib/db/types';

interface V2TaskItem extends Task {
  original_id?: string;
}

interface V2TasksState {
  tasks: V2TaskItem[];
  subtasks: Record<number, Subtask[]>;
  activeTag: string;
  tags: string[];
  nextTask: V2TaskItem | null;
  isLoading: boolean;

  setTasks: (tasks: V2TaskItem[]) => void;
  setSubtasks: (taskId: number, subtasks: Subtask[]) => void;
  setActiveTag: (tag: string) => void;
  setTags: (tags: string[]) => void;
  setNextTask: (task: V2TaskItem | null) => void;
  addTask: (task: V2TaskItem) => void;
  updateTask: (id: number, updates: Partial<V2TaskItem>) => void;
  removeTask: (id: number) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useV2TasksStore = create<V2TasksState>((set) => ({
  tasks: [],
  subtasks: {},
  activeTag: 'master',
  tags: ['master'],
  nextTask: null,
  isLoading: true,

  setTasks: (tasks) => set({ tasks }),
  setSubtasks: (taskId, subtasks) =>
    set((state) => ({
      subtasks: {
        ...state.subtasks,
        [taskId]: subtasks,
      },
    })),
  setActiveTag: (tag) => set({ activeTag: tag }),
  setTags: (tags) => set({ tags }),
  setNextTask: (task) => set({ nextTask: task }),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task)),
    })),
  removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
  setIsLoading: (isLoading) => set({ isLoading }),
}));
