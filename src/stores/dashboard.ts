import { create } from 'zustand';
import type { Todo } from '@/components/kanban/types';
import type { Message } from '@/components/messages/types';
import type {
  Sprint,
  Agent,
  AgentTask,
  LinearProject,
  LinearIssue,
  LinearWorkflowState,
} from '@/lib/db/types';

export type EnrichedAgent = Agent & {
  current_task: AgentTask | null;
  sub_agent_count: number;
  age_seconds: number;
};

interface DashboardState {
  todos: Todo[];
  messages: Message[];
  sprints: Sprint[];
  projects: Array<{ id: string; name: string; color: string | null }>;
  agents: EnrichedAgent[];
  linearProjects: LinearProject[];
  linearIssues: LinearIssue[];
  linearWorkflowStates: LinearWorkflowState[];
  activeSprint: string | null;
  selectedProject: string | null;
  currentSessionId: string | null;
  isConnected: boolean;
  lastFetchTime: number | null;

  setTodos: (todos: Todo[]) => void;
  setMessages: (messages: Message[]) => void;
  setSprints: (sprints: Sprint[]) => void;
  setProjects: (projects: Array<{ id: string; name: string; color: string | null }>) => void;
  setAgents: (agents: EnrichedAgent[]) => void;
  setLinearProjects: (projects: LinearProject[]) => void;
  setLinearIssues: (issues: LinearIssue[]) => void;
  setLinearWorkflowStates: (states: LinearWorkflowState[]) => void;
  setActiveSprint: (id: string | null) => void;
  setSelectedProject: (projectId: string | null) => void;
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
  projects: [],
  agents: [],
  linearProjects: [],
  linearIssues: [],
  linearWorkflowStates: [],
  activeSprint: null,
  selectedProject: null,
  currentSessionId: null,
  isConnected: false,
  lastFetchTime: null,

  setTodos: (todos) => set({ todos }),
  setMessages: (messages) => set({ messages }),
  setSprints: (sprints) => set({ sprints }),
  setProjects: (projects) => set({ projects }),
  setAgents: (agents) => set({ agents }),
  setLinearProjects: (linearProjects) => set({ linearProjects }),
  setLinearIssues: (linearIssues) => set({ linearIssues }),
  setLinearWorkflowStates: (linearWorkflowStates) => set({ linearWorkflowStates }),
  setActiveSprint: (activeSprint) => set({ activeSprint }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
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
