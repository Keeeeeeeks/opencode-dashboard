'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '@/stores/dashboard';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

export function usePolling() {
  const {
    setTodos,
    setMessages,
    setSprints,
    setProjects,
    setAgents,
    setLinearProjects,
    setLinearIssues,
    setLinearWorkflowStates,
    setIsConnected,
    setLastFetchTime,
    currentSessionId,
    activeSprint,
    selectedProject,
  } = useDashboardStore();

  const isPollingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const todosParams = new URLSearchParams();
      if (currentSessionId) {
        todosParams.set('session_id', currentSessionId);
      }
      if (activeSprint) {
        todosParams.set('sprint_id', activeSprint);
      }
      if (selectedProject) {
        todosParams.set('project', selectedProject);
      }

      const projectsRequest = fetch(`${API_BASE}/api/settings/projects`, {
        headers: authHeaders(),
        credentials: 'include',
      }).catch(() => null);

      const agentsRequest = fetch(`${API_BASE}/api/agents`, {
        headers: authHeaders(),
        credentials: 'include',
      }).catch(() => null);

      const linearIssuesRequest = fetch(`${API_BASE}/api/linear/issues`, {
        headers: authHeaders(),
        credentials: 'include',
      }).catch(() => null);

      const linearProjectsRequest = fetch(`${API_BASE}/api/linear/projects`, {
        headers: authHeaders(),
        credentials: 'include',
      }).catch(() => null);

      const [todosRes, messagesRes, sprintsRes, projectsRes, agentsRes, linearIssuesRes, linearProjectsRes] = await Promise.all([
        fetch(`${API_BASE}/api/todos?${todosParams}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/messages`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/sprints`, { headers: authHeaders() }),
        projectsRequest,
        agentsRequest,
        linearIssuesRequest,
        linearProjectsRequest,
      ]);

      if (todosRes.ok) {
        const todosData = await todosRes.json();
        setTodos(todosData.todos || []);
      }

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        const messages = messagesData.messages || [];
        setMessages(
          selectedProject
            ? messages.filter((message: { project_id?: string | null }) => message.project_id === selectedProject)
            : messages
        );
      }

      if (sprintsRes.ok) {
        const sprintsData = await sprintsRes.json();
        const sprints = sprintsData.sprints || [];
        setSprints(
          selectedProject
            ? sprints.filter((sprint: { project_id?: string | null }) => sprint.project_id === selectedProject)
            : sprints
        );
      }

      if (projectsRes?.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }

      if (agentsRes?.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData.agents || []);
      }

      if (linearIssuesRes?.ok) {
        const linearIssuesData = await linearIssuesRes.json();
        setLinearIssues(linearIssuesData.issues || []);
        setLinearWorkflowStates(linearIssuesData.workflow_states || []);
      }

      if (linearProjectsRes?.ok) {
        const linearProjectsData = await linearProjectsRes.json();
        setLinearProjects(linearProjectsData.projects || []);
      }

      setIsConnected(true);
      setLastFetchTime(Date.now());
    } catch (error) {
      console.error('Polling error:', error);
      setIsConnected(false);
    } finally {
      isPollingRef.current = false;
    }
  }, [
    activeSprint,
    currentSessionId,
    selectedProject,
    setTodos,
    setMessages,
    setSprints,
    setProjects,
    setAgents,
    setLinearProjects,
    setLinearIssues,
    setLinearWorkflowStates,
    setIsConnected,
    setLastFetchTime,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateTodoStatus = useCallback(
    async (id: string, status: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/todos`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ id, status }),
        });

        if (!res.ok) throw new Error('Failed to update todo');

        fetchData();
      } catch (error) {
        console.error('Update todo error:', error);
      }
    },
    [fetchData]
  );

  const markMessagesAsRead = useCallback(
    async (ids: number[]) => {
      try {
        const res = await fetch(`${API_BASE}/api/messages`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ids: ids.map(String) }),
        });

        if (!res.ok) throw new Error('Failed to mark messages as read');

        fetchData();
      } catch (error) {
        console.error('Mark as read error:', error);
      }
    },
    [fetchData]
  );

  return {
    fetchData,
    updateTodoStatus,
    markMessagesAsRead,
  };
}
