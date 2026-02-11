'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumnProps, Todo } from './types';

const statusTopColors: Record<Todo['status'], string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const statusLabels: Record<Todo['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function KanbanColumn({ title, status, todos, onStatusChange }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-h-[500px] rounded-xl transition-shadow',
        isOver && 'ring-2 ring-offset-2'
      )}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderTop: `2px solid ${statusTopColors[status]}`,
        ...(isOver
          ? {
              ringColor: 'var(--accent)',
              boxShadow: '0 0 0 2px var(--accent), var(--shadow-glow)',
              outline: '2px solid var(--accent)',
              outlineOffset: '2px',
            }
          : {}),
      }}
    >
      <div
        className="sticky top-0 z-10 flex items-center justify-between p-3 backdrop-blur-md rounded-t-xl"
        style={{
          background: 'var(--glass-bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3
          className="font-semibold text-sm"
          style={{ color: 'var(--text-strong)' }}
        >
          {statusLabels[status] || title}
        </h3>
        <span
          className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--muted)',
          }}
        >
          {todos.length}
        </span>
      </div>

      <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto">
          {todos.length === 0 ? (
            <div
              className="flex h-32 items-center justify-center text-sm"
              style={{ color: 'var(--muted)' }}
            >
              No tasks
            </div>
          ) : (
            todos.map((todo) => <KanbanCard key={todo.id} todo={todo} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}
