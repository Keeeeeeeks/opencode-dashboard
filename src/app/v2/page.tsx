'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun, Menu, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useV2TasksStore } from '@/stores/v2Tasks';
import { useV2Tasks } from '@/hooks/useV2Tasks';
import {
  TaskBoard,
  TagSwitcher,
  NextTaskPanel,
  NewTaskModal,
  TaskDetailModal,
  type Task,
} from '@/components/v2';

export default function V2DashboardPage() {
  const {
    tasks,
    subtasks,
    activeTag,
    tags,
    nextTask,
    isLoading,
    setActiveTag,
    setTags,
    updateTask: updateTaskInStore,
  } = useV2TasksStore();

  const {
    fetchData,
    updateTask,
    createTask,
    deleteTask,
    fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
  } = useV2Tasks();

  const [isDark, setIsDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    const hasLight = document.documentElement.classList.contains('light');
    setIsDark(!hasLight);
  }, []);

  useEffect(() => {
    const missingSubtasks = tasks.filter((task) => task.source !== 'v1' && subtasks[task.id] === undefined);
    for (const task of missingSubtasks) {
      void fetchSubtasks(task.id);
    }
  }, [tasks, subtasks, fetchSubtasks]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => ['pending', 'in_progress', 'blocked', 'review', 'done'].includes(task.status)),
    [tasks]
  );

  const toggleDark = () => {
    document.documentElement.classList.toggle('light');
    setIsDark(!isDark);
  };

  const handleStatusChange = async (id: number, status: Task['status']) => {
    const task = tasks.find((item) => item.id === id);
    updateTaskInStore(id, { status });
    await updateTask(id, {
      status,
      ...(task?.original_id ? { original_id: task.original_id } : {}),
    });
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
                <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
                  OpenCode Dashboard
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  v2 - Task Planner
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors"
                style={{
                  background: 'var(--bg-hover)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                Back to V1
              </Link>

              <button
                onClick={toggleDark}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden rounded-lg p-2 transition-colors"
                style={{ color: 'var(--muted)' }}
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
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
                  Task Board
                </h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Structured tasks with dependencies and subtasks
                </p>
              </div>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
            </div>

            <TaskBoard
              tasks={visibleTasks}
              subtasks={subtasks}
              onStatusChange={handleStatusChange}
              onSelectTask={(task) => setSelectedTask(task)}
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
            style={{ background: sidebarOpen ? 'var(--bg)' : undefined }}
          >
            <div className="h-full md:sticky md:top-24 space-y-4">
              <NextTaskPanel
                task={nextTask}
                onOpenTask={(task) => setSelectedTask(task)}
                onStartWorking={async (task) => {
                  await updateTask(task.id, {
                    status: 'in_progress',
                    ...(task.original_id ? { original_id: task.original_id } : {}),
                  });
                }}
              />

              <TagSwitcher
                tags={tags}
                activeTag={activeTag}
                onChangeTag={(tag) => setActiveTag(tag)}
                onCreateTag={(tag) => {
                  const nextTags = new Set(tags);
                  nextTags.add(tag);
                  setTags(Array.from(nextTags).sort());
                }}
              />
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

      <NewTaskModal
        open={newTaskOpen}
        activeTag={activeTag}
        tasks={tasks}
        onClose={() => setNewTaskOpen(false)}
        onCreate={async (data) => {
          await createTask({
            title: data.title,
            description: data.description,
            priority: data.priority,
            tag: data.tag,
            dependencies: data.dependencies,
          });
          await fetchData();
        }}
      />

      <TaskDetailModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        tasks={tasks}
        subtasks={selectedTask ? subtasks[selectedTask.id] || [] : []}
        onClose={() => setSelectedTask(null)}
        onSave={async (taskId, updates) => {
          const task = tasks.find((item) => item.id === taskId);
          await updateTask(taskId, {
            ...updates,
            ...(task?.original_id ? { original_id: task.original_id } : {}),
          });
          await fetchData();
        }}
        onDelete={async (taskId, originalId) => {
          await deleteTask(taskId, originalId);
          await fetchData();
          setSelectedTask(null);
        }}
        onFetchSubtasks={async (taskId) => {
          await fetchSubtasks(taskId);
        }}
        onCreateSubtask={async (taskId, data) => {
          await createSubtask(taskId, data);
          await fetchData();
        }}
        onUpdateSubtask={async (taskId, subtaskId, updates) => {
          await updateSubtask(taskId, subtaskId, updates);
          await fetchData();
        }}
        onDeleteSubtask={async (taskId, subtaskId) => {
          await deleteSubtask(taskId, subtaskId);
          await fetchData();
        }}
      />
    </div>
  );
}
