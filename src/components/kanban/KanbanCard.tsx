'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDistanceToNow } from 'date-fns';
import { GripVertical, Clock, User, FolderOpen, ChevronDown, ChevronRight, ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KanbanCardProps, Todo } from './types';

const priorityStyles: Record<Todo['priority'], { bg: string; color: string }> = {
  high: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
};

export function KanbanCard({ todo, isDragging, childCount, isSubtask, isExpanded, onToggleExpand }: KanbanCardProps) {
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
  const hasChildren = (childCount ?? 0) > 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isSubtask ? 'var(--card)' : 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: dragging
          ? 'var(--shadow-glow), var(--shadow-lg)'
          : isSubtask ? 'none' : 'var(--shadow-sm)',
      }}
      className={cn(
        'group relative rounded-lg transition-all duration-200',
        isSubtask ? 'p-2.5' : 'p-3',
        dragging && 'opacity-80 rotate-2 scale-105'
      )}
      onMouseEnter={(e) => {
        if (!dragging) {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.boxShadow = isSubtask ? 'var(--shadow-sm)' : 'var(--shadow-md)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!dragging) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = isSubtask ? 'none' : 'var(--shadow-sm)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'mt-0.5 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity',
            isSubtask && 'h-3.5 w-3.5'
          )}
          style={{ color: 'var(--muted)' }}
        >
          <GripVertical className={isSubtask ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand?.();
                }}
                className="mt-0.5 shrink-0 rounded p-0.5 transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            )}
            <p
              className={cn('line-clamp-3', isSubtask ? 'text-xs' : 'text-sm')}
              style={{ color: isSubtask ? 'var(--muted)' : 'var(--text)' }}
            >
              {todo.content}
            </p>
          </div>
          
          <div className={cn('flex flex-wrap items-center gap-2', isSubtask ? 'mt-1.5' : 'mt-2')}>
            <span
              className={cn(
                'inline-flex items-center rounded-full font-medium',
                isSubtask ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'
              )}
              style={{
                background: priorityStyles[todo.priority].bg,
                color: priorityStyles[todo.priority].color,
              }}
            >
              {todo.priority}
            </span>

            {hasChildren && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: 'rgba(139, 92, 246, 0.12)',
                  color: '#a78bfa',
                }}
              >
                <ListTree className="h-3 w-3" />
                {childCount} subtask{childCount !== 1 ? 's' : ''}
              </span>
            )}
            
            {todo.project && !isSubtask && (
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

            {todo.agent && !isSubtask && (
              <span
                className="inline-flex items-center gap-1 text-xs font-mono"
                style={{ color: 'var(--muted)' }}
              >
                <User className="h-3 w-3" />
                {todo.agent}
              </span>
            )}
            
            {!isSubtask && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(todo.updated_at * 1000, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
