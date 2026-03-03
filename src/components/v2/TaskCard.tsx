'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListChecks, Link2, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskCardProps } from './types';

const priorityStyles = {
  high: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
} as const;

const statusColors: Record<string, string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  review: '#14b8a6',
  done: '#22c55e',
  deferred: '#64748b',
  cancelled: '#ef4444',
};

const statusOrder: string[] = [
  'pending',
  'in_progress',
  'blocked',
  'review',
  'done',
  'deferred',
  'cancelled',
];

function dependencyCount(rawDependencies: string | null): number {
  if (!rawDependencies) {
    return 0;
  }

  try {
    const parsed = JSON.parse(rawDependencies) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function TaskCard({ task, subtasks, onClick, onStatusChange, isDragging }: TaskCardProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;
  const deps = dependencyCount(task.dependencies);
  const doneSubtasks = useMemo(
    () => subtasks.filter((subtask) => subtask.status === 'done').length,
    [subtasks]
  );

  const handleStatusClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (onStatusChange) {
        setStatusOpen((prev) => !prev);
      }
    },
    [onStatusChange]
  );

  const handleStatusSelect = useCallback(
    (event: React.MouseEvent, newStatus: string) => {
      event.stopPropagation();
      if (onStatusChange && newStatus !== task.status) {
        onStatusChange(task.id, newStatus as typeof task.status);
      }
      setStatusOpen(false);
    },
    [onStatusChange, task.id, task.status]
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: dragging ? 'var(--shadow-glow), var(--shadow-lg)' : 'var(--shadow-sm)',
      }}
      className={cn(
        'group relative rounded-lg p-3 transition-all duration-200',
        dragging && 'opacity-80 rotate-2 scale-105'
      )}
      onMouseEnter={(event) => {
        if (!dragging) {
          event.currentTarget.style.borderColor = 'var(--border-strong)';
          event.currentTarget.style.boxShadow = 'var(--shadow-md)';
          event.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(event) => {
        if (!dragging) {
          event.currentTarget.style.borderColor = 'var(--border)';
          event.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          event.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--muted)' }}
          aria-label="Drag task"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button className="flex-1 min-w-0 text-left" onClick={() => onClick(task)}>
          <p className="text-sm line-clamp-2" style={{ color: 'var(--text)' }}>
            {task.title}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative" ref={statusRef}>
              <button
                type="button"
                onClick={handleStatusClick}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  background: `${statusColors[task.status] ?? '#71717a'}20`,
                  color: statusColors[task.status] ?? '#71717a',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: statusColors[task.status] ?? '#71717a' }}
                />
                {task.status}
                {onStatusChange && <ChevronDown className="h-3 w-3" />}
              </button>

              {statusOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border py-1"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                    boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  {statusOrder.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={(event) => handleStatusSelect(event, s)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                        s === task.status && 'font-semibold'
                      )}
                      style={{ color: s === task.status ? statusColors[s] : 'var(--text)' }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: statusColors[s] }}
                      />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: priorityStyles[task.priority].bg,
                color: priorityStyles[task.priority].color,
              }}
            >
              {task.priority}
            </span>

            {deps > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
              >
                <Link2 className="h-3 w-3" />
                {deps} deps
              </span>
            )}

            {subtasks.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
              >
                <ListChecks className="h-3 w-3" />
                {doneSubtasks}/{subtasks.length}
              </span>
            )}

            {task.assigned_agent_id && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono"
                style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
              >
                <User className="h-3 w-3" />
                {task.assigned_agent_id}
              </span>
            )}

            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
            >
              #{task.tag}
            </span>

            {task.source === 'v1' && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono"
                style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
              >
                v1
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
