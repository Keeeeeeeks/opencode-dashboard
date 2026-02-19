'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumnProps, Todo } from './types';

const statusTopColors: Record<Todo['status'], string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
  icebox: '#38bdf8',
};

const statusLabels: Record<Todo['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  icebox: 'Icebox',
};

export function KanbanColumn({ title, status, todos, onStatusChange, onSelectTodo, childTodosMap, expandedParents, onToggleExpand }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [collapsed, setCollapsed] = useState(false);

  const parentTodos = todos.filter((t) => !t.parent_id);
  const orphanChildren = todos.filter((t) => {
    if (!t.parent_id) return false;
    // Hide children whose parent exists anywhere (they render nested under the parent)
    const parentOwnsChildren = childTodosMap.has(t.parent_id);
    if (parentOwnsChildren) return false;
    // Show children whose parent doesn't exist at all (truly orphaned)
    return true;
  });

  const allSortableIds = todos.map((t) => t.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl transition-all min-w-[320px]',
        !collapsed && 'min-h-[500px]',
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
        className="sticky top-0 z-10 flex items-center justify-between p-3 backdrop-blur-md rounded-t-xl cursor-pointer select-none"
        style={{
          background: 'var(--glass-bg)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--muted)' }} className="transition-transform">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <h3
            className="font-semibold text-sm"
            style={{ color: 'var(--text-strong)' }}
          >
            {statusLabels[status] || title}
          </h3>
        </div>
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

      {!collapsed && (
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          <div className="flex-1 p-2 space-y-2 overflow-y-auto">
            {todos.length === 0 ? (
              <div
                className="flex h-32 items-center justify-center text-sm"
                style={{ color: 'var(--muted)' }}
              >
                No tasks
              </div>
            ) : (
              <>
                {parentTodos.map((todo) => {
                  const allChildren = childTodosMap.get(todo.id) || [];
                  const isExpanded = expandedParents.has(todo.id);

                  return (
                    <div key={todo.id}>
                      <KanbanCard
                        todo={todo}
                        childCount={allChildren.length}
                        isExpanded={isExpanded}
                        onToggleExpand={() => onToggleExpand(todo.id)}
                        onStatusChange={onStatusChange}
                        onSelectTodo={onSelectTodo}
                      />
                      {isExpanded && allChildren.length > 0 && (
                        <div
                          className="ml-6 mt-1 space-y-1.5 pl-3"
                          style={{ borderLeft: '2px solid var(--border)' }}
                        >
                          {allChildren.map((child) => (
                            <KanbanCard
                              key={child.id}
                              todo={child}
                              isSubtask
                              onStatusChange={onStatusChange}
                              onSelectTodo={onSelectTodo}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {orphanChildren.map((todo) => (
                  <KanbanCard key={todo.id} todo={todo} isSubtask onStatusChange={onStatusChange} onSelectTodo={onSelectTodo} />
                ))}
              </>
            )}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
