'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

const PROJECTS = [
  'the-culture',
  'bell-and-the-void',
  'clawdina-tales',
  'opencode-dashboard',
  'crypto-attestation',
  'infrastructure',
] as const;

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

export function NewTicketModal({ open, onClose, onCreated }: NewTicketModalProps) {
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [project, setProject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + autofocus
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => contentRef.current?.focus());
    }
  }, [open]);

  // Escape to close
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

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;
    const modal = modalRef.current;
    const handleTab = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'textarea, input, select, button, [tabindex]:not([tabindex="-1"])'
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
    setContent('');
    setPriority('medium');
    setProject('');
    setError(null);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string | null> = {
        content: trimmed,
        priority,
        status: 'pending',
        project: project || null,
      };

      const res = await fetch(`${API_BASE}/api/todos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to create ticket');

      reset();
      onCreated();
      onClose();
    } catch {
      setError('Failed to create ticket. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTextareaKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="New Ticket"
        className="relative w-full max-w-lg rounded-xl border animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,.5))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
            New Ticket
          </h3>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Content */}
          <div>
            <label
              htmlFor="ticket-content"
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text)' }}
            >
              Description <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea
              ref={contentRef}
              id="ticket-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleTextareaKey}
              placeholder="What needs to be done?"
              rows={3}
              required
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

          {/* Priority + Project row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label
                htmlFor="ticket-priority"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text)' }}
              >
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 appearance-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': 'var(--accent)',
                }}
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🔴 High</option>
              </select>
            </div>

            <div className="flex-1">
              <label
                htmlFor="ticket-project"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text)' }}
              >
                Project
              </label>
              <select
                id="ticket-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 appearance-none"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  // @ts-expect-error CSS custom property
                  '--tw-ring-color': 'var(--accent)',
                }}
              >
                <option value="">None</option>
                {PROJECTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          {/* Footer */}
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
                disabled={!content.trim() || submitting}
                className="rounded-lg px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {submitting ? 'Creating…' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
