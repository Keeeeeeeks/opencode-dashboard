'use client';

import { useState, useRef, useCallback } from 'react';
import { Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodoData {
  id: string;
  content: string;
  status: string;
  priority: string;
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#3b82f6',
  pending: '#a855f7',
  cancelled: '#6b7280',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

export function TodoRefChip({ todoId }: { todoId: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [todoData, setTodoData] = useState<TodoData | null>(null);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const hasFetched = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTodo = useCallback(async () => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setFetchState('loading');

    try {
      const res = await fetch(`/api/todos?id=${encodeURIComponent(todoId)}`);
      if (!res.ok) throw new Error('Not found');
      const data: TodoData = await res.json();
      setTodoData(data);
      setFetchState('idle');
    } catch {
      setFetchState('error');
    }
  }, [todoId]);

  const handleMouseEnter = () => {
    hoverTimeout.current = setTimeout(() => {
      setIsHovered(true);
      fetchTodo();
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setIsHovered(false);
  };

  const statusColor = todoData ? (STATUS_COLORS[todoData.status] ?? '#6b7280') : '#6b7280';
  const priorityColor = todoData ? (PRIORITY_COLORS[todoData.priority] ?? '#6b7280') : '#6b7280';

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs',
          'cursor-pointer transition-colors duration-150'
        )}
        style={{
          background: isHovered ? 'var(--accent)' : 'var(--accent-subtle)',
          border: '1px solid var(--border)',
          color: isHovered ? 'var(--bg)' : 'var(--accent)',
        }}
      >
        <Hash className="h-3 w-3" />
        {todoId}
      </span>

      {isHovered && (
        <span
          className="absolute left-0 bottom-full mb-2 z-50 block rounded-lg p-3"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            minWidth: '200px',
            maxWidth: '280px',
          }}
        >
          {fetchState === 'loading' && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Loading…
            </span>
          )}

          {fetchState === 'error' && (
            <span className="text-xs" style={{ color: '#ef4444' }}>
              Not found
            </span>
          )}

          {fetchState === 'idle' && todoData && (
            <span className="flex flex-col gap-2">
              <span className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                {todoData.content}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background: `${statusColor}1a`,
                    color: statusColor,
                    border: `1px solid ${statusColor}33`,
                  }}
                >
                  {todoData.status.replace('_', ' ')}
                </span>
                <span
                  className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background: `${priorityColor}1a`,
                    color: priorityColor,
                    border: `1px solid ${priorityColor}33`,
                  }}
                >
                  {todoData.priority}
                </span>
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
