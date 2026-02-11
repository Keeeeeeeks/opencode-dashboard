/**
 * Oh-My-OpenCode Dashboard Hook
 * 
 * This hook sends real-time updates to the OpenCode Dashboard app.
 * 
 * Installation:
 * 1. Copy this file to your oh-my-opencode hooks directory
 * 2. Configure the DASHBOARD_URL environment variable (default: http://localhost:3000)
 * 3. The hook will automatically send events when todos change or errors occur
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || '';

function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${DASHBOARD_API_KEY}`,
  };
}

interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

interface HookContext {
  sessionId?: string;
  agentName?: string;
  todos?: Todo[];
}

type EventType = 'todo_update' | 'error' | 'state_change';

async function sendEvent(type: EventType, payload: Record<string, unknown>, sessionId?: string) {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        type,
        payload,
        sessionId,
      }),
    });

    if (!response.ok) {
      console.error(`[Dashboard Hook] Failed to send event: ${response.status}`);
    }
  } catch (error) {
    console.error('[Dashboard Hook] Error sending event:', error);
  }
}

async function syncTodos(todos: Todo[], sessionId?: string, agentName?: string) {
  try {
    const batchResponse = await fetch(`${DASHBOARD_URL}/api/todos`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        todos: todos.map((todo) => ({
          id: todo.id,
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          session_id: sessionId,
          agent: agentName,
        })),
      }),
    });

    if (batchResponse.ok) {
      return;
    }

    console.warn(
      `[Dashboard Hook] Batch todo sync failed with status ${batchResponse.status}, falling back to POST sync`
    );

    for (const todo of todos) {
      await fetch(`${DASHBOARD_URL}/api/todos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: todo.id,
          content: todo.content,
          status: todo.status,
          priority: todo.priority,
          session_id: sessionId,
          agent: agentName,
        }),
      });
    }
  } catch (error) {
    console.error('[Dashboard Hook] Error syncing todos:', error);
  }
}

export const dashboardHook = {
  name: 'dashboard-hook',
  
  onTodoUpdate: async (todos: Todo[], context: HookContext) => {
    await syncTodos(todos, context.sessionId, context.agentName);
    
    await sendEvent('todo_update', {
      count: todos.length,
      statuses: {
        pending: todos.filter(t => t.status === 'pending').length,
        in_progress: todos.filter(t => t.status === 'in_progress').length,
        completed: todos.filter(t => t.status === 'completed').length,
      },
    }, context.sessionId);
  },

  onTaskComplete: async (todo: Todo, context: HookContext) => {
    await sendEvent('state_change', {
      message: `Task completed: ${todo.content.substring(0, 100)}`,
      todoId: todo.id,
    }, context.sessionId);
  },

  onError: async (error: Error, context: HookContext) => {
    await sendEvent('error', {
      message: error.message,
      stack: error.stack?.substring(0, 500),
    }, context.sessionId);
  },

  onStateChange: async (fromState: string, toState: string, context: HookContext) => {
    await sendEvent('state_change', {
      message: `State changed: ${fromState} → ${toState}`,
      from: fromState,
      to: toState,
    }, context.sessionId);
  },

  onSessionStart: async (sessionId: string) => {
    try {
      await fetch(`${DASHBOARD_URL}/api/sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: sessionId,
          name: `Session ${new Date().toLocaleString()}`,
        }),
      });
    } catch (error) {
      console.error('[Dashboard Hook] Error creating session:', error);
    }
  },
};

export default dashboardHook;
