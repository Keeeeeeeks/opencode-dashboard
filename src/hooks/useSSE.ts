'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

export function useSSE(fetchData: () => Promise<void>) {
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startFallbackPolling = useCallback(() => {
    if (fallbackIntervalRef.current) return;
    fallbackIntervalRef.current = setInterval(fetchData, 3000);
  }, [fetchData]);

  const stopFallbackPolling = useCallback(() => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const token = API_KEY;
    if (!token) {
      startFallbackPolling();
      return;
    }

    function connect() {
      const es = new EventSource(`${API_BASE}/api/stream?token=${encodeURIComponent(token)}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        setIsSSEConnected(true);
        stopFallbackPolling();
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        fetchData();
      });

      es.addEventListener('todo:updated', () => fetchData());
      es.addEventListener('todo:created', () => fetchData());
      es.addEventListener('todo:deleted', () => fetchData());
      es.addEventListener('message:created', () => fetchData());
      es.addEventListener('sprint:updated', () => fetchData());
      es.addEventListener('sprint:created', () => fetchData());
      es.addEventListener('project:updated', () => fetchData());
      es.addEventListener('agent:status', () => fetchData());

      es.onerror = () => {
        setIsSSEConnected(false);
        es.close();
        eventSourceRef.current = null;
        startFallbackPolling();
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      stopFallbackPolling();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [fetchData, startFallbackPolling, stopFallbackPolling]);

  return { isSSEConnected };
}
