const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY || '';

function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${DASHBOARD_API_KEY}`,
  };
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${DASHBOARD_URL}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed (${response.status})`);
  }

  return response;
}

async function patchJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${DASHBOARD_URL}${path}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${path} failed (${response.status})`);
  }

  return response;
}

export const agentHook = {
  name: 'agent-hook',

  sendHeartbeat: async (agentId: string) => {
    await postJson(`/api/agents/${encodeURIComponent(agentId)}/heartbeat`, {});
  },

  reportError: async (agentId: string, taskId: string) => {
    await postJson(`/api/agents/${encodeURIComponent(agentId)}/error`, { taskId });
  },

  reportBlock: async (
    agentId: string,
    taskId: string,
    source: 'explicit' | 'question' | 'repeated_errors' | 'idle' | 'resource_denied',
    reason: string
  ) => {
    await postJson(`/api/agents/${encodeURIComponent(agentId)}/block`, {
      taskId,
      source,
      reason,
    });
  },

  completeTask: async (agentId: string, taskId: string) => {
    await postJson(`/api/agents/${encodeURIComponent(agentId)}/complete`, { taskId });
  },

  onAgentSpawn: async (agent: {
    id: string;
    name: string;
    type: string;
    parent_agent_id?: string;
    skills?: string[];
    soul_md?: string;
    config?: Record<string, unknown>;
  }) => {
    try {
      await postJson('/api/agents', {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        parent_agent_id: agent.parent_agent_id,
        soul_md: agent.soul_md,
        skills: agent.skills,
        config: agent.config,
      });
    } catch (error) {
      console.error('[Agent Hook] Error registering agent:', error);
    }
  },

  onTaskStart: async (
    agentId: string,
    task: { id?: string; title: string; project_id?: string; priority?: string }
  ) => {
    try {
      await postJson(`/api/agents/${encodeURIComponent(agentId)}/tasks`, {
        id: task.id,
        title: task.title,
        project_id: task.project_id,
        priority: task.priority,
        status: 'in_progress',
      });
    } catch (error) {
      console.error('[Agent Hook] Error creating task:', error);
    }
  },

  onHeartbeat: async (agentId: string, progress?: Record<string, unknown>) => {
    try {
      void progress;
      await agentHook.sendHeartbeat(agentId);
    } catch (error) {
      console.error('[Agent Hook] Error updating heartbeat:', error);
    }
  },

  onTaskComplete: async (
    agentId: string,
    taskId: string,
    result?: { status: 'completed' | 'cancelled'; reason?: string }
  ) => {
    try {
      if (result?.status !== 'cancelled') {
        await agentHook.completeTask(agentId, taskId);
        return;
      }

      await patchJson(
        `/api/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}`,
        {
          status: result?.status || 'completed',
          blocked_reason: result?.reason || null,
        }
      );
    } catch (error) {
      console.error('[Agent Hook] Error completing task:', error);
    }
  },

  onTaskBlocked: async (agentId: string, taskId: string, reason: string) => {
    try {
      await agentHook.reportBlock(agentId, taskId, 'explicit', reason);
    } catch (error) {
      console.error('[Agent Hook] Error marking task blocked:', error);
    }
  },

  onAgentSleep: async (agentId: string) => {
    try {
      await postJson(`/api/agents/${encodeURIComponent(agentId)}/actions`, { action: 'sleep' });
    } catch (error) {
      console.error('[Agent Hook] Error sending sleep action:', error);
    }
  },

  onAgentStop: async (agentId: string) => {
    try {
      await postJson(`/api/agents/${encodeURIComponent(agentId)}/actions`, { action: 'stop' });
    } catch (error) {
      console.error('[Agent Hook] Error sending stop action:', error);
    }
  },
};

export default agentHook;
