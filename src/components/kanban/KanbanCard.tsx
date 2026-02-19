'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDistanceToNow } from 'date-fns';
import { GripVertical, Clock, User, FolderOpen, ChevronDown, ChevronRight, ListTree, MessageSquare, Timer, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard';
import type { KanbanCardProps, Todo } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function sprintAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

const priorityStyles: Record<Todo['priority'], { bg: string; color: string }> = {
  high: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
};

export function KanbanCard({ todo, isDragging, childCount, isSubtask, isExpanded, onToggleExpand, onStatusChange, onSelectTodo }: KanbanCardProps) {
  const allSprints = useDashboardStore((s) => s.sprints);
  const [commentCount, setCommentCount] = useState(todo.comment_count || 0);
  const [sprintDropdownOpen, setSprintDropdownOpen] = useState(false);
  const [localSprints, setLocalSprints] = useState(todo.sprints || []);
  const [toggling, setToggling] = useState<string | null>(null);
  const sprintDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCommentCount(todo.comment_count || 0);
  }, [todo.comment_count]);

  useEffect(() => {
    setLocalSprints(todo.sprints || []);
  }, [todo.sprints]);

  useEffect(() => {
    if (!sprintDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sprintDropdownRef.current && !sprintDropdownRef.current.contains(e.target as Node)) {
        setSprintDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sprintDropdownOpen]);

  const toggleSprintAssignment = useCallback(async (sprintId: string, assigned: boolean) => {
    setToggling(sprintId);
    try {
      const method = assigned ? 'DELETE' : 'POST';
      await fetch(`${API_BASE}/api/todos/${todo.id}/sprints`, {
        method,
        headers: sprintAuthHeaders(),
        body: JSON.stringify({ sprint_id: sprintId }),
      });

      if (assigned) {
        setLocalSprints((prev) => prev.filter((s) => s.id !== sprintId));
      } else {
        const sprint = allSprints.find((s) => s.id === sprintId);
        if (sprint) {
          setLocalSprints((prev) => [...prev, { id: sprint.id, name: sprint.name }]);
        }
      }
    } catch {
    } finally {
      setToggling(null);
    }
  }, [todo.id, allSprints]);

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
        'group relative rounded-lg transition-all duration-200 cursor-pointer',
        isSubtask ? 'p-2.5' : 'p-3',
        dragging && 'opacity-80 rotate-2 scale-105'
      )}
      onClick={() => { if (!dragging) onSelectTodo?.(todo); }}
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
            <div className="flex-1 min-w-0">
              {todo.name ? (
                <>
                  <p
                    className={cn('line-clamp-2 font-medium', isSubtask ? 'text-xs' : 'text-sm')}
                    style={{ color: isSubtask ? 'var(--text)' : 'var(--text-strong)' }}
                  >
                    {todo.name}
                  </p>
                  <p
                    className={cn('line-clamp-2 mt-0.5', isSubtask ? 'text-[10px]' : 'text-xs')}
                    style={{ color: 'var(--muted)' }}
                  >
                    {todo.content}
                  </p>
                </>
              ) : (
                <p
                  className={cn('line-clamp-3', isSubtask ? 'text-xs' : 'text-sm')}
                  style={{ color: isSubtask ? 'var(--muted)' : 'var(--text)' }}
                >
                  {todo.content}
                </p>
              )}
            </div>
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

            {!isSubtask && (
              <div className="relative inline-flex" ref={sprintDropdownRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSprintDropdownOpen(!sprintDropdownOpen);
                  }}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    background: localSprints.length > 0 ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-hover)',
                    color: localSprints.length > 0 ? '#14b8a6' : 'var(--muted)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = localSprints.length > 0
                      ? 'rgba(20, 184, 166, 0.25)' : 'var(--border)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = localSprints.length > 0
                      ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-hover)';
                  }}
                >
                  <Timer className="h-3 w-3" />
                  {localSprints.length > 0
                    ? localSprints.map((s) => s.name).join(', ')
                    : 'Sprint'}
                </button>

                {sprintDropdownOpen && (
                  <div
                    className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border py-1 shadow-lg"
                    style={{
                      background: 'var(--card)',
                      borderColor: 'var(--border)',
                      boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,.5))',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {allSprints.length === 0 ? (
                      <div className="px-3 py-2 text-xs" style={{ color: 'var(--muted)' }}>
                        No sprints available
                      </div>
                    ) : (
                      allSprints.map((sprint) => {
                        const isAssigned = localSprints.some((s) => s.id === sprint.id);
                        const isLoading = toggling === sprint.id;
                        return (
                          <button
                            key={sprint.id}
                            type="button"
                            disabled={isLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSprintAssignment(sprint.id, isAssigned);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                            style={{ color: 'var(--text)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                              style={{
                                borderColor: isAssigned ? '#14b8a6' : 'var(--border)',
                                background: isAssigned ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                              }}
                            >
                              {isAssigned && <Check className="h-3 w-3" style={{ color: '#14b8a6' }} />}
                            </span>
                            <span className="truncate">{sprint.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
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

            {commentCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                <MessageSquare className="h-3 w-3" />
                {commentCount}
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
