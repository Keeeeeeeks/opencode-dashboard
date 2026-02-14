'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import type { TaskColumnProps, BoardStatus } from './types';

const statusTopColors: Record<BoardStatus, string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  review: '#14b8a6',
  done: '#22c55e',
};

const statusLabels: Record<BoardStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
};

export function TaskColumn({ status, tasks, subtasks, onSelectTask }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={cn('flex flex-col rounded-xl transition-all', !collapsed && 'min-h-[500px]', isOver && 'ring-2 ring-offset-2')}
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
        className="sticky top-0 z-10 flex items-center justify-between p-3 backdrop-blur-md rounded-t-xl cursor-pointer select-none"
        style={{
          background: 'var(--glass-bg)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--muted)' }}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>
            {statusLabels[status]}
          </h3>
        </div>
        <span
          className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium"
          style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
        >
          {tasks.length}
        </span>
      </div>

      {!collapsed && (
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 p-2 space-y-2 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                No tasks
              </div>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  subtasks={subtasks[task.id] || []}
                  onClick={onSelectTask}
                />
              ))
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
