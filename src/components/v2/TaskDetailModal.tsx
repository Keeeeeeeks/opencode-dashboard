'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import type { Task, TaskDetailModalProps } from './types';

const taskStatuses: Array<Task['status']> = [
  'pending',
  'in_progress',
  'blocked',
  'review',
  'done',
  'deferred',
  'cancelled',
];

const statusColors: Record<Task['status'], string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  review: '#14b8a6',
  done: '#22c55e',
  deferred: '#64748b',
  cancelled: '#ef4444',
};

function parseDependencies(dependencies: string | null): number[] {
  if (!dependencies) {
    return [];
  }
  try {
    const parsed = JSON.parse(dependencies) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

export function TaskDetailModal({
  open,
  task,
  tasks,
  subtasks,
  onClose,
  onSave,
  onDelete,
  onFetchSubtasks,
  onCreateSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Task['status']>('pending');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [details, setDetails] = useState('');
  const [testStrategy, setTestStrategy] = useState('');
  const [saving, setSaving] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task || !open) {
      return;
    }

    setTitle(task.title);
    setDescription(task.description || '');
    setStatus(task.status);
    setPriority(task.priority);
    setDetails(task.details || '');
    setTestStrategy(task.test_strategy || '');
    setError(null);
    if (task.source !== 'v1') {
      void onFetchSubtasks(task.id);
    }
  }, [open, task, onFetchSubtasks]);

  const dependencyTasks = useMemo(() => {
    if (!task) {
      return [];
    }
    const depIds = parseDependencies(task.dependencies);
    const taskMap = new Map(tasks.map((item) => [item.id, item]));
    return depIds
      .map((depId) => taskMap.get(depId))
      .filter((value): value is Task => Boolean(value));
  }, [task, tasks]);

  if (!open || !task) {
    return null;
  }

  const isV1Task = task.source === 'v1';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl rounded-xl border"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
            Task Details
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5" style={{ color: 'var(--muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Title
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isV1Task}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isV1Task}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {isV1Task && (
            <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
              This is a V1 legacy todo. Only status and priority can be edited.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Status
              </label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Task['status'])}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {taskStatuses.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Task['priority'])}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </div>
          </div>

          {!isV1Task && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Details (Markdown)
              </label>
              <textarea
                rows={5}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm font-mono resize-y"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          )}

          {!isV1Task && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Test Strategy
              </label>
              <textarea
                rows={3}
                value={testStrategy}
                onChange={(event) => setTestStrategy(event.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          )}

          {!isV1Task && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
                Dependencies
              </h4>
              {dependencyTasks.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  No linked dependencies.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {dependencyTasks.map((dependency) => (
                    <div key={dependency.id} className="flex items-center justify-between rounded px-2 py-1">
                      <span className="text-sm" style={{ color: 'var(--text)' }}>
                        {dependency.title}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: statusColors[dependency.status] }}>
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: statusColors[dependency.status] }}
                        />
                        {dependency.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isV1Task && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-strong)' }}>
                Subtasks
              </h4>
              <div className="space-y-2">
                {subtasks.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    No subtasks yet.
                  </p>
                )}
                {subtasks.map((subtask) => (
                  <div key={subtask.id} className="flex items-center gap-2 rounded px-2 py-1" style={{ background: 'var(--bg)' }}>
                    <input
                      type="checkbox"
                      checked={subtask.status === 'done'}
                      onChange={(event) => {
                        void onUpdateSubtask(task.id, subtask.id, {
                          status: event.target.checked ? 'done' : 'pending',
                        });
                      }}
                    />
                    <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>
                      {subtask.title}
                    </span>
                    <button
                      onClick={() => void onDeleteSubtask(task.id, subtask.id)}
                      className="rounded px-2 py-1 text-xs"
                      style={{ color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  placeholder="Add subtask"
                  className="flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => {
                    if (!newSubtaskTitle.trim()) {
                      return;
                    }
                    void onCreateSubtask(task.id, { title: newSubtaskTitle.trim() });
                    setNewSubtaskTitle('');
                  }}
                  className="rounded-lg px-3 py-2 text-sm flex items-center gap-1"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          )}

          {task.complexity_score !== null && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Complexity score: {task.complexity_score}
            </p>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => {
              const confirmed = window.confirm('Delete this task and all subtasks?');
              if (!confirmed) {
                return;
              }
              void onDelete(task.id, task.original_id);
            }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1"
            style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.12)' }}
          >
            <Trash2 className="h-4 w-4" />
            Delete Task
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  const saveUpdates: Partial<Task> = isV1Task
                    ? {
                        status,
                        priority,
                        original_id: task.original_id,
                      }
                    : {
                        title: title.trim(),
                        description: description.trim() || null,
                        status,
                        priority,
                        details: details.trim() || null,
                        test_strategy: testStrategy.trim() || null,
                      };
                  await onSave(task.id, saveUpdates);
                  onClose();
                } catch {
                  setError('Failed to save task updates.');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={(!isV1Task && !title.trim()) || saving}
              className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
