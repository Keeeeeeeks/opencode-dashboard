'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  Loader2,
  Send,
  MessageSquare,
  User,
  FolderOpen,
  Timer,
  Link2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Activity,
} from 'lucide-react';
import { TodoRefChip } from '@/components/messages/TodoRefChip';
import { Toast } from '@/components/ui/Toast';
import { parseTodoRefs } from '@/lib/parseTodoRefs';
import { renderMarkdownLite } from '@/lib/markdownLite';
import { cn } from '@/lib/utils';
import type { Todo } from './types';

interface TodoComment {
  id: number;
  todo_id: string;
  body: string;
  author: string;
  created_at: number;
}

interface TaskDetailModalProps {
  todo: Todo | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: Todo['status']) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';
const AVATAR_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#14b8a6', '#f97316'];

const statusTopColors: Record<Todo['status'], string> = {
  pending: '#71717a',
  in_progress: '#3b82f6',
  blocked: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
  icebox: '#38bdf8',
};

const statusLabels: Record<Todo['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  icebox: 'Icebox',
};

const priorityStyles: Record<Todo['priority'], { bg: string; color: string }> = {
  high: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
};

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  return headers;
}

function getInitials(author: string): string {
  const words = author.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'AN';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getAvatarColor(author: string): string {
  let hash = 0;
  for (let i = 0; i < author.length; i += 1) {
    hash = (hash + author.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
}

function formatTimestamp(ts: number): string {
  return format(ts * 1000, 'MMM d, yyyy · h:mm a');
}

export function TaskDetailModal({ todo, open, onClose, onStatusChange }: TaskDetailModalProps) {
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('clawdina');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const canSubmit = body.trim().length > 0 && author.trim().length > 0 && !submitting;

  useEffect(() => {
    if (!open || !todo) return;

    let cancelled = false;
    const fetchComments = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/todos/${encodeURIComponent(todo.id)}/comments`, {
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setComments(data.comments || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchComments();
    return () => { cancelled = true; };
  }, [open, todo]);

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
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit || !todo) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/todos/${encodeURIComponent(todo.id)}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ body: body.trim(), author: author.trim() }),
      });
      if (!res.ok) return;

      const data = await res.json();
      const created = data.comment as TodoComment;
      setComments((prev) => [...prev, created]);
      setBody('');
      setToastVisible(true);

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000);

      requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } finally {
      setSubmitting(false);
    }
  };

  const commentItems = useMemo(
    () =>
      comments.map((comment) => {
        const segments = parseTodoRefs(comment.body);
        const avatarColor = getAvatarColor(comment.author);

        return (
          <div
            key={comment.id}
            className="rounded-lg p-3"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background: `${avatarColor}26`, color: avatarColor, border: `1px solid ${avatarColor}55` }}
              >
                {getInitials(comment.author)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                  {comment.author}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  {formatDistanceToNow(comment.created_at * 1000, { addSuffix: true })}
                </div>
              </div>
            </div>

            <div
              className={cn(
                'text-sm leading-relaxed break-words whitespace-pre-wrap',
                '[&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono'
              )}
              style={{ color: 'var(--text)' }}
            >
              {segments.map((segment, index) => {
                if (segment.type === 'ref') {
                  return <TodoRefChip key={`${comment.id}-ref-${segment.todoId}-${index}`} todoId={segment.todoId} />;
                }
                return (
                  <span key={`${comment.id}-text-${index}`}>
                    {renderMarkdownLite(segment.value)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      }),
    [comments]
  );

  if (!open || !todo) return null;

  const statusColor = statusTopColors[todo.status];
  const pStyle = priorityStyles[todo.priority];

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Modal panel */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Task details"
          className="relative w-full max-w-2xl rounded-xl border animate-in fade-in zoom-in-95 duration-200 flex flex-col"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,.5))',
            maxHeight: 'calc(100vh - 16vh)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-mono mb-1" style={{ color: 'var(--muted)' }}>
                {todo.id}
              </p>
              <h2 className="text-base font-semibold leading-snug" style={{ color: 'var(--text-strong)' }}>
                {todo.content}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 transition-colors shrink-0 mt-0.5"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Metadata grid */}
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {/* Status */}
                <div className="flex items-center gap-2.5">
                  <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Status</span>
                  <span
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: `${statusColor}20`,
                      color: statusColor,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: statusColor }}
                    />
                    {statusLabels[todo.status]}
                  </span>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center text-[10px]" style={{ color: 'var(--muted)' }}>
                    !!
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Priority</span>
                  <span
                    className="ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                    style={{ background: pStyle.bg, color: pStyle.color }}
                  >
                    {todo.priority}
                  </span>
                </div>

                {/* Sprint */}
                <div className="flex items-center gap-2.5">
                  <Timer className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Sprint</span>
                  <div className="ml-auto flex flex-wrap gap-1 justify-end">
                    {todo.sprints && todo.sprints.length > 0 ? (
                      todo.sprints.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: 'rgba(20, 184, 166, 0.15)', color: '#14b8a6' }}
                        >
                          {s.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </div>
                </div>

                {/* Agent */}
                <div className="flex items-center gap-2.5">
                  <User className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Agent</span>
                  <span className="ml-auto text-xs font-mono truncate" style={{ color: 'var(--text)' }}>
                    {todo.agent || '—'}
                  </span>
                </div>

                {/* Project */}
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Project</span>
                  {todo.project ? (
                    <span
                      className="ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
                    >
                      {todo.project}
                    </span>
                  ) : (
                    <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </div>

                {/* Parent link */}
                {todo.parent_id && (
                  <div className="flex items-center gap-2.5">
                    <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                    <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Parent</span>
                    <span
                      className="ml-auto text-xs font-mono truncate"
                      style={{ color: 'var(--accent)' }}
                    >
                      {todo.parent_id}
                    </span>
                  </div>
                )}

                {/* Created */}
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Created</span>
                  <span className="ml-auto text-xs truncate" style={{ color: 'var(--text)' }}>
                    {formatTimestamp(todo.created_at)}
                  </span>
                </div>

                {/* Updated */}
                <div className="flex items-center gap-2.5">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Updated</span>
                  <span className="ml-auto text-xs truncate" style={{ color: 'var(--text)' }}>
                    {formatDistanceToNow(todo.updated_at * 1000, { addSuffix: true })}
                  </span>
                </div>

                {/* Completed */}
                {todo.completed_at && (
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ok, #22c55e)' }} />
                    <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>Completed</span>
                    <span className="ml-auto text-xs truncate" style={{ color: 'var(--ok, #22c55e)' }}>
                      {formatTimestamp(todo.completed_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-5" style={{ borderTop: '1px solid var(--border)' }} />

            {/* Comments section */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                  Comments
                </h3>
                {comments.length > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium"
                    style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
                  >
                    {comments.length}
                  </span>
                )}
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--muted)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading comments…
                </div>
              )}

              {!loading && comments.length === 0 && (
                <div
                  className="rounded-lg border border-dashed p-4 text-sm text-center"
                  style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
                >
                  No comments yet. Start the conversation below.
                </div>
              )}

              {!loading && comments.length > 0 && (
                <div className="space-y-2.5">
                  {commentItems}
                </div>
              )}
              <div ref={commentsEndRef} />
            </div>
          </div>

          {/* Comment form — pinned at bottom */}
          <div
            className="shrink-0 px-5 py-3 space-y-2"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author"
                className="w-28 shrink-0 rounded-lg px-2.5 py-1.5 text-xs outline-none transition-colors focus:ring-1"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Add a comment… Use #todo_abc to reference a task"
                rows={2}
                className="flex-1 resize-none rounded-lg px-2.5 py-1.5 text-xs outline-none transition-colors focus:ring-1"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                ⌘+Enter to send
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  !canSubmit && 'cursor-not-allowed opacity-40'
                )}
                style={{ background: 'var(--accent)', color: '#fff' }}
                onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>

      <Toast show={toastVisible} message="Comment added" />
    </>
  );
}
