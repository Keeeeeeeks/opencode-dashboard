import { create } from 'zustand';
import type { Todo } from '@/components/kanban/types';
import type { Message } from '@/components/messages/types';
import type { Sprint } from '@/lib/db/types';

interface DashboardState {
  todos: Todo[];
  messages: Message[];
  sprints: Sprint[];
  activeSprint: string | null;
  currentSessionId: string | null;
  isConnected: boolean;
  lastFetchTime: number | null;

  setTodos: (todos: Todo[]) => void;
  setMessages: (messages: Message[]) => void;
  setSprints: (sprints: Sprint[]) => void;
  setActiveSprint: (id: string | null) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setIsConnected: (connected: boolean) => void;
  setLastFetchTime: (time: number) => void;

  updateTodoStatus: (id: string, status: Todo['status']) => void;
  markMessagesAsRead: (ids: number[]) => void;
  addMessage: (message: Message) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  todos: [],
  messages: [],
  sprints: [],
  activeSprint: null,
  currentSessionId: null,
  isConnected: false,
  lastFetchTime: null,

  setTodos: (todos) => set({ todos }),
  setMessages: (messages) => set({ messages }),
  setSprints: (sprints) => set({ sprints }),
  setActiveSprint: (activeSprint) => set({ activeSprint }),
  setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setLastFetchTime: (time) => set({ lastFetchTime: time }),

  updateTodoStatus: (id, status) =>
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, status, updated_at: Math.floor(Date.now() / 1000) } : todo
      ),
    })),

  markMessagesAsRead: (ids) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        ids.includes(msg.id) ? { ...msg, read: true } : msg
      ),
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [message, ...state.messages],
    })),
}));
