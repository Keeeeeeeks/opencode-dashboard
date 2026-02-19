'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { KanbanBoard } from '@/components/kanban';
import { MessageFeed } from '@/components/messages';
import { useDashboardStore } from '@/stores/dashboard';
import { useAuthStore } from '@/stores/auth';
import { usePolling } from '@/hooks/usePolling';
import { Moon, Sun, Menu, X, Plus, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NewTicketModal } from '@/components/kanban/NewTicketModal';
import { TaskDetailModal } from '@/components/kanban/TaskDetailModal';
import { VelocityWidget } from '@/components/sprints/VelocityWidget';
import { CreateSprintModal } from '@/components/sprints/CreateSprintModal';
import { SprintHeader } from '@/components/sprints/SprintHeader';
import type { Todo } from '@/components/kanban/types';
import { AuthGuard } from '@/components/auth/AuthGuard';

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const { todos, messages, sprints, activeSprint, setActiveSprint, isConnected } = useDashboardStore();
  const { updateTodoStatus, markMessagesAsRead, fetchData } = usePolling();
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newSprintOpen, setNewSprintOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    const hasLight = document.documentElement.classList.contains('light');
    setIsDark(!hasLight);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('oc-panel-collapsed');
      if (stored === 'true') setPanelCollapsed(true);
    } catch {}
  }, []);

  const togglePanel = useCallback(() => {
    setPanelCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('oc-panel-collapsed', String(next)); } catch {}
      return next;
    });
  }, []);

  const handleSelectTodo = useCallback((todo: Todo) => {
    setSelectedTodo(todo);
  }, []);

  useEffect(() => {
    if (todos.length > 0 || messages.length > 0) {
      setIsLoading(false);
    }
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [todos, messages]);

  const toggleDark = () => {
    document.documentElement.classList.toggle('light');
    setIsDark(!isDark);
  };

  const handleStatusChange = (id: string, newStatus: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'icebox') => {
    updateTodoStatus(id, newStatus);
    useDashboardStore.getState().updateTodoStatus(id, newStatus);
  };

  const handleMarkAsRead = (ids: number[]) => {
    markMessagesAsRead(ids);
    useDashboardStore.getState().markMessagesAsRead(ids);
  };

  const selectedSprint = activeSprint ? sprints.find((sprint) => sprint.id === activeSprint) : null;

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <header
          className="sticky top-0 z-50 border-b backdrop-blur-xl"
          style={{
            background: 'var(--chrome)',
            borderColor: 'var(--border)',
            height: 56,
          }}
        >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                style={{
                  background: 'var(--accent-subtle)',
                  boxShadow: '0 0 20px var(--accent-glow)',
                }}
              >
                🦞
              </div>
              <div>
                <h1
                  className="text-base font-semibold tracking-tight"
                  style={{ color: 'var(--text-strong)' }}
                >
                  OpenCode Dashboard
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Agent work tracker
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: isConnected ? 'var(--ok)' : 'var(--danger)',
                    boxShadow: isConnected
                      ? '0 0 8px rgba(34, 197, 94, 0.4)'
                      : '0 0 8px rgba(239, 68, 68, 0.4)',
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center">
                <select
                  value={activeSprint ?? ''}
                  onChange={(event) => setActiveSprint(event.target.value || null)}
                  className="rounded-l-md px-2.5 py-1.5 text-xs font-medium outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRight: 'none',
                  }}
                >
                  <option value="">All Sprints</option>
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setNewSprintOpen(true)}
                  className="rounded-r-md px-2 py-1.5 transition-colors"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = '#14b8a6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                    e.currentTarget.style.color = 'var(--muted)';
                  }}
                  title="Create new sprint"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                onClick={toggleDark}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              <Link
                href={`${process.env.NEXT_PUBLIC_API_BASE || ''}/analytics`}
                className="rounded-lg px-3 py-1.5 text-xs font-medium tracking-wide transition-colors"
                style={{
                  background: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text)';
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                Analytics
              </Link>

              {user?.role === 'owner' ? (
                <Link
                  href={`${process.env.NEXT_PUBLIC_API_BASE || ''}/settings`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tracking-wide transition-colors"
                  style={{
                    background: 'transparent',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--muted)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Link>
              ) : null}

              <button
                onClick={togglePanel}
                className="hidden md:flex rounded-lg p-2 transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                aria-label={panelCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                {panelCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
              </button>

              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden rounded-lg p-2 transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        </header>

        <main className="mx-auto max-w-[1920px] px-4 py-6 sm:px-6 lg:px-8 animate-dashboard-enter">
          <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex-1 min-w-0">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: 'var(--text-strong)' }}
                >
                  Task Board
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Drag tasks between columns to update status
                </p>
              </div>
              <button
                onClick={() => setNewTicketOpen(true)}
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
            </div>
            <NewTicketModal
              open={newTicketOpen}
              onClose={() => setNewTicketOpen(false)}
              onCreated={() => fetchData()}
            />
            <CreateSprintModal
              open={newSprintOpen}
              onClose={() => setNewSprintOpen(false)}
              onCreated={() => fetchData()}
            />
            {selectedSprint && <SprintHeader sprint={selectedSprint} />}
            <KanbanBoard
              todos={todos}
              activeSprintId={activeSprint}
              onStatusChange={handleStatusChange}
              onSelectTodo={handleSelectTodo}
              isLoading={isLoading}
            />
          </div>

          <div
            className={cn(
              'shrink-0 overflow-hidden',
              'fixed inset-y-0 right-0 z-40 p-4 pt-20',
              'md:relative md:p-0 md:pt-0 md:z-auto',
              'transform transition-all duration-300 ease-in-out',
              'md:transform-none',
              sidebarOpen ? 'translate-x-0 w-full' : 'translate-x-full md:translate-x-0',
              panelCollapsed ? 'md:w-0 md:opacity-0 md:pointer-events-none' : 'md:w-80 lg:w-96 md:opacity-100'
            )}
            style={{
              background: sidebarOpen ? 'var(--bg)' : undefined,
              transitionProperty: 'width, opacity, transform',
            }}
          >
            <div className="h-full md:sticky md:top-24 w-80 lg:w-96">
              <div
                className="h-[calc(100vh-8rem)] md:h-[calc(100vh-7rem)] rounded-xl p-4 flex flex-col"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {selectedSprint ? (
                  <VelocityWidget
                    sprintId={selectedSprint.id}
                    sprintName={selectedSprint.name}
                    sprintStatus={selectedSprint.status}
                  />
                ) : null}
                <div className="min-h-0 flex-1">
                  <MessageFeed
                    messages={messages}
                    onMarkAsRead={handleMarkAsRead}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            </div>
          </div>

          {sidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </div>
        </main>

        <TaskDetailModal
          todo={selectedTodo}
          open={selectedTodo !== null}
          onClose={() => setSelectedTodo(null)}
          onStatusChange={handleStatusChange}
        />
      </div>
    </AuthGuard>
  );
}
