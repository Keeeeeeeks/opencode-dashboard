'use client';

import { useState, useMemo } from 'react';
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
import { Filter, Plus } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { NewTicketModal } from './NewTicketModal';
import type { KanbanBoardProps, Todo } from './types';

const columns: Todo['status'][] = ['pending', 'in_progress', 'blocked', 'completed', 'icebox'];

export function KanbanBoard({ todos, onStatusChange, isLoading }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);

  const projects = useMemo(() => {
    const set = new Set<string>();
    todos.forEach((t) => { if (t.project) set.add(t.project); });
    return Array.from(set).sort();
  }, [todos]);

  const filteredTodos = useMemo(
    () => selectedProject ? todos.filter((t) => t.project === selectedProject) : todos,
    [todos, selectedProject]
  );

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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {columns.map((status) => (
            <KanbanColumn
              key={status}
              title={status}
              status={status}
              todos={filteredTodos.filter((t) => t.status === status)}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTodo ? <KanbanCard todo={activeTodo} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
