'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '@/stores/dashboard';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const POLL_INTERVAL = 3000;
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
    setIsConnected,
    setLastFetchTime,
    currentSessionId,
    activeSprint,
  } = useDashboardStore();

  const isPollingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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

      const [todosRes, messagesRes, sprintsRes] = await Promise.all([
        fetch(`${API_BASE}/api/todos?${todosParams}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/messages`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/sprints`, { headers: authHeaders() }),
      ]);

      if (todosRes.ok) {
        const todosData = await todosRes.json();
        setTodos(todosData.todos || []);
      }

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setMessages(messagesData.messages || []);
      }

      if (sprintsRes.ok) {
        const sprintsData = await sprintsRes.json();
        setSprints(sprintsData.sprints || []);
      }

      setIsConnected(true);
      setLastFetchTime(Date.now());
    } catch (error) {
      console.error('Polling error:', error);
      setIsConnected(false);
    } finally {
      isPollingRef.current = false;
    }
  }, [activeSprint, currentSessionId, setTodos, setMessages, setSprints, setIsConnected, setLastFetchTime]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
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
