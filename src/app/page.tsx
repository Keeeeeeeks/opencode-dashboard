'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KanbanBoard } from '@/components/kanban';
import { MessageFeed } from '@/components/messages';
import { useDashboardStore } from '@/stores/dashboard';
import { usePolling } from '@/hooks/usePolling';
import { Activity, Moon, Sun, Menu, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NewTicketModal } from '@/components/kanban/NewTicketModal';

export default function Dashboard() {
  const { todos, messages, isConnected } = useDashboardStore();
  const { updateTodoStatus, markMessagesAsRead, fetchData } = usePolling();
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hasLight = document.documentElement.classList.contains('light');
    setIsDark(!hasLight);
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

  return (
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
                href={`${process.env.NEXT_PUBLIC_API_BASE || ''}/v2`}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors"
                style={{
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
              >
                V2
              </Link>

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

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 animate-dashboard-enter">
        <div className="flex flex-col md:flex-row gap-6">
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
            <KanbanBoard
              todos={todos}
              onStatusChange={handleStatusChange}
              isLoading={isLoading}
            />
          </div>

          <div
            className={cn(
              'w-full md:w-80 lg:w-96 shrink-0',
              'fixed inset-y-0 right-0 z-40 p-4 pt-20 md:p-0 md:pt-0',
              'md:relative',
              'transform transition-transform duration-300 ease-in-out',
              'md:transform-none',
              sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
            )}
            style={{
              background: sidebarOpen ? 'var(--bg)' : undefined,
            }}
          >
            <div className="h-full md:sticky md:top-24">
              <div
                className="h-[calc(100vh-8rem)] md:h-[calc(100vh-7rem)] rounded-xl p-4"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <MessageFeed
                  messages={messages}
                  onMarkAsRead={handleMarkAsRead}
                  isLoading={isLoading}
                />
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
    </div>
  );
}
