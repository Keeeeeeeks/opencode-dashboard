'use client';

import { useState } from 'react';
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
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import type { KanbanBoardProps, Todo } from './types';

const columns: Todo['status'][] = ['pending', 'in_progress', 'blocked', 'completed', 'icebox'];

export function KanbanBoard({ todos, onStatusChange, isLoading }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const activeTodo = activeId ? todos.find((t) => t.id === activeId) : null;

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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 stagger-children">
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
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {columns.map((status) => (
          <KanbanColumn
            key={status}
            title={status}
            status={status}
            todos={todos.filter((t) => t.status === status)}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTodo ? <KanbanCard todo={activeTodo} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
