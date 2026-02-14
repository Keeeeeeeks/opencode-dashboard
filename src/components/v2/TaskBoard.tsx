'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import type { TaskBoardProps, BoardStatus, Task } from './types';

const columns: BoardStatus[] = ['pending', 'in_progress', 'blocked', 'review', 'done'];

export function TaskBoard({ tasks, subtasks, onStatusChange, onSelectTask, isLoading }: TaskBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeTask = useMemo(
    () => (activeId ? tasks.find((task) => task.id === activeId) || null : null),
    [activeId, tasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      return;
    }

    const activeTaskId = Number(active.id);
    const overId = String(over.id);

    if (columns.includes(overId as BoardStatus)) {
      const fromTask = tasks.find((task) => task.id === activeTaskId);
      if (fromTask && fromTask.status !== overId) {
        onStatusChange(fromTask.id, overId as Task['status']);
      }
      return;
    }

    const toTask = tasks.find((task) => task.id === Number(overId));
    const fromTask = tasks.find((task) => task.id === activeTaskId);
    if (toTask && fromTask && toTask.status !== fromTask.status) {
      onStatusChange(fromTask.id, toTask.status);
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
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-24 rounded-lg animate-skeleton" />
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
          <TaskColumn
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            subtasks={subtasks}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            subtasks={subtasks[activeTask.id] || []}
            onClick={onSelectTask}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
