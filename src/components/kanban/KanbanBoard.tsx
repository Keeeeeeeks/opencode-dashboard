'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Filter, Plus, ListTree } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { NewTicketModal } from './NewTicketModal';
import type { KanbanBoardProps, Todo } from './types';

const columns: Todo['status'][] = ['pending', 'in_progress', 'blocked', 'completed', 'icebox'];

export function KanbanBoard({ todos, activeSprintId, onStatusChange, isLoading }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const projects = useMemo(() => {
    const set = new Set<string>();
    todos.forEach((t) => { if (t.project) set.add(t.project); });
    return Array.from(set).sort();
  }, [todos]);

  const filteredTodos = useMemo(
    () => selectedProject ? todos.filter((t) => t.project === selectedProject) : todos,
    [todos, selectedProject]
  );

  const childTodosMap = useMemo(() => {
    const map = new Map<string, Todo[]>();
    filteredTodos.filter((t) => t.parent_id).forEach((t) => {
      const children = map.get(t.parent_id!) || [];
      children.push(t);
      map.set(t.parent_id!, children);
    });
    return map;
  }, [filteredTodos]);

  const handleToggleExpand = useCallback((parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeTodo = activeId ? filteredTodos.find((t) => t.id === activeId) : null;
  const activeTodoChildCount = activeTodo && !activeTodo.parent_id
    ? (childTodosMap.get(activeTodo.id) || []).length
    : 0;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (columns.includes(overId as Todo['status'])) {
      const activeTodo = todos.find((t) => t.id === activeId);
      if (activeTodo && activeTodo.status !== overId) {
        onStatusChange(activeId, overId as Todo['status']);
      }
      return;
    }

    const overTodo = todos.find((t) => t.id === overId);
    if (overTodo) {
      const activeTodo = todos.find((t) => t.id === activeId);
      if (activeTodo && activeTodo.status !== overTodo.status) {
        onStatusChange(activeId, overTodo.status);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="overflow-x-auto pb-2" style={{ scrollbarGutter: 'stable' }}>
      <div className="grid gap-4 stagger-children" style={{ gridTemplateColumns: 'repeat(5, minmax(320px, 1fr))' }}>
        {columns.map((status) => (
          <div
            key={status}
            className="min-h-[500px] rounded-xl border-t-2"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              borderTop: '2px solid var(--border-strong)',
            }}
          >
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="h-5 w-24 rounded animate-skeleton" />
            </div>
            <div className="p-2 space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg animate-skeleton"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setShowNewTicket(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
          style={{
            background: 'var(--accent)',
            color: '#fff',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </button>

        {projects.length > 0 && (
          <>
          <div className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
          <Filter className="h-4 w-4" style={{ color: 'var(--muted)' }} />
          <select
            value={selectedProject ?? ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
            className="rounded-md px-3 py-1.5 text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          </>
        )}

        {activeSprintId ? (
          <span
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            Sprint Filter Active
          </span>
        ) : null}
      </div>

      <NewTicketModal
        open={showNewTicket}
        onClose={() => setShowNewTicket(false)}
        onCreated={() => {/* polling auto-refreshes */}}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2" style={{ scrollbarGutter: 'stable' }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(5, minmax(320px, 1fr))' }}>
            {columns.map((status) => (
              <KanbanColumn
                key={status}
                title={status}
                status={status}
                todos={filteredTodos.filter((t) => t.status === status)}
                onStatusChange={onStatusChange}
                childTodosMap={childTodosMap}
                expandedParents={expandedParents}
                onToggleExpand={handleToggleExpand}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTodo ? (
            <div className="relative">
              <KanbanCard
                todo={activeTodo}
                isDragging
                childCount={activeTodoChildCount}
                isSubtask={!!activeTodo.parent_id}
              />
              {activeTodoChildCount > 0 && (
                <div
                  className="absolute -bottom-2 -right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <ListTree className="h-3 w-3" />
                  {activeTodoChildCount}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
