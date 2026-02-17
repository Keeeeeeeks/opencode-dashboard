'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { X, Zap } from 'lucide-react';

interface CreateSprintModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function CreateSprintModal({ open, onClose, onCreated }: CreateSprintModalProps) {
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 86400000);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(toDateInputValue(now));
  const [endDate, setEndDate] = useState(toDateInputValue(twoWeeksOut));
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !modalRef.current) return;
    const modal = modalRef.current;
    const handleTab = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  const reset = () => {
    setName('');
    const n = new Date();
    setStartDate(toDateInputValue(n));
    setEndDate(toDateInputValue(new Date(n.getTime() + 14 * 86400000)));
    setGoal('');
    setError(null);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    const startUnix = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
    const endUnix = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

    if (endUnix < startUnix) {
      setError('End date must be after start date.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/sprints`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: trimmedName,
          start_date: startUnix,
          end_date: endUnix,
          goal: goal.trim() || null,
          status: 'planning',
        }),
      });

      if (!res.ok) throw new Error('Failed to create sprint');

      reset();
      onCreated();
      onClose();
    } catch {
      setError('Failed to create sprint. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create Sprint"
        className="relative w-full max-w-lg rounded-xl border animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,.5))',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: '#14b8a6' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
              New Sprint
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="sprint-name"
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text)' }}
            >
              Sprint Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              ref={nameRef}
              id="sprint-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sprint 12 — Auth & Permissions"
              required
              className="w-full rounded-lg px-3 py-2 text-sm transition-colors placeholder:opacity-40 focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                // @ts-expect-error CSS custom property
                '--tw-ring-color': 'var(--accent)',
              }}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label
                htmlFor="sprint-start"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text)' }}
              >
                Start Date
              </label>
              <input
                id="sprint-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  colorScheme: 'dark',
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': 'var(--accent)',
                }}
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="sprint-end"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text)' }}
              >
                End Date
              </label>
              <input
                id="sprint-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  colorScheme: 'dark',
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': 'var(--accent)',
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="sprint-goal"
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text)' }}
            >
              Goal <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>(optional)</span>
            </label>
            <textarea
              id="sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ship the auth module and close all P0 bugs"
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none transition-colors placeholder:opacity-40 focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                // @ts-expect-error CSS custom property
                '--tw-ring-color': 'var(--accent)',
              }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              ⌘+Enter to submit
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="rounded-lg px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: '#14b8a6',
                  color: '#fff',
                }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {submitting ? 'Creating…' : 'Create Sprint'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
