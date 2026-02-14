'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { NewTaskModalProps } from './types';

export function NewTaskModal({ open, activeTag, tasks, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [tag, setTag] = useState(activeTag);
  const [dependencies, setDependencies] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTag(activeTag);
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [activeTag, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const availableDependencies = useMemo(
    () => tasks.filter((task) => task.tag === tag && task.status !== 'done'),
    [tag, tasks]
  );

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setTag(activeTag);
    setDependencies([]);
    setError(null);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        priority,
        tag: tag.trim() || activeTag,
        dependencies,
      });
      reset();
      onClose();
    } catch {
      setError('Failed to create task. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTitleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New Task"
        className="relative w-full max-w-xl rounded-xl border animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
            New Task
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Title <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={handleTitleKey}
              placeholder="Task title"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as 'high' | 'medium' | 'low')}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Tag
              </label>
              <input
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Dependencies
            </label>
            <div
              className="max-h-36 overflow-y-auto rounded-lg border p-2 space-y-1"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
            >
              {availableDependencies.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  No dependencies available in this tag.
                </p>
              ) : (
                availableDependencies.map((task) => {
                  const checked = dependencies.includes(task.id);
                  return (
                    <label key={task.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setDependencies((current) => [...current, task.id]);
                          } else {
                            setDependencies((current) => current.filter((depId) => depId !== task.id));
                          }
                        }}
                      />
                      <span style={{ color: 'var(--text)' }}>{task.title}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Cmd/Ctrl+Enter to submit
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || submitting}
                className="rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {submitting ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
