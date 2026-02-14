'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDistanceToNow } from 'date-fns';
import { GripVertical, Clock, User, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KanbanCardProps, Todo } from './types';

const priorityStyles: Record<Todo['priority'], { bg: string; color: string }> = {
  high: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
};

export function KanbanCard({ todo, isDragging }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: dragging
          ? 'var(--shadow-glow), var(--shadow-lg)'
          : 'var(--shadow-sm)',
      }}
      className={cn(
        'group relative rounded-lg p-3 transition-all duration-200',
        dragging && 'opacity-80 rotate-2 scale-105'
      )}
      onMouseEnter={(e) => {
        if (!dragging) {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!dragging) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--muted)' }}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        
        <div className="flex-1 min-w-0">
          <p
            className="text-sm line-clamp-3"
            style={{ color: 'var(--text)' }}
          >
            {todo.content}
          </p>
          
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: priorityStyles[todo.priority].bg,
                color: priorityStyles[todo.priority].color,
              }}
            >
              {todo.priority}
            </span>
            
            {todo.project && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                }}
              >
                <FolderOpen className="h-3 w-3" />
                {todo.project}
              </span>
            )}

            {todo.agent && (
              <span
                className="inline-flex items-center gap-1 text-xs font-mono"
                style={{ color: 'var(--muted)' }}
              >
                <User className="h-3 w-3" />
                {todo.agent}
              </span>
            )}
            
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(todo.updated_at * 1000, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
