'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';
import { TodoRefChip } from '@/components/messages/TodoRefChip';
import { Toast } from '@/components/ui/Toast';
import { parseTodoRefs } from '@/lib/parseTodoRefs';
import { renderMarkdownLite } from '@/lib/markdownLite';
import { cn } from '@/lib/utils';

interface TodoComment {
  id: number;
  todo_id: string;
  body: string;
  author: string;
  created_at: number;
}

interface CommentDrawerProps {
  todoId: string;
  open: boolean;
  onClose: () => void;
  onCommentCreated?: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';
const AVATAR_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#14b8a6', '#f97316'];

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

export function CommentDrawer({ todoId, open, onClose, onCommentCreated }: CommentDrawerProps) {
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('clawdina');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSubmit = body.trim().length > 0 && author.trim().length > 0 && !submitting;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const fetchComments = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/todos/${encodeURIComponent(todoId)}/comments`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setComments(data.comments || []);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchComments();

    return () => {
      cancelled = true;
    };
  }, [open, todoId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/todos/${encodeURIComponent(todoId)}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ body: body.trim(), author: author.trim() }),
      });
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const created = data.comment as TodoComment;
      setComments((prev) => [...prev, created]);
      setBody('');
      setToastVisible(true);
      onCommentCreated?.();

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
      }, 3000);
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
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: `${avatarColor}26`, color: avatarColor, border: `1px solid ${avatarColor}55` }}
              >
                {getInitials(comment.author)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                  {comment.author}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
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

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <button
          type="button"
          className="absolute inset-0"
          style={{ background: 'rgba(0, 0, 0, 0.55)' }}
          onClick={onClose}
          aria-label="Close comments"
        />

        <aside
          className={cn(
            'absolute right-0 top-0 h-full w-full max-w-md p-3 transition-transform duration-300',
            open ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div
            className="flex h-full flex-col rounded-xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Comments</h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    todo {todoId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading comments...
                </div>
              )}

              {!loading && comments.length === 0 && (
                <div
                  className="rounded-lg border border-dashed p-4 text-sm"
                  style={{ color: 'var(--muted)', borderColor: 'var(--border-strong)' }}
                >
                  No comments yet. Start the thread.
                </div>
              )}

              {!loading && commentItems}
            </div>

            <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2">
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Author"
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
              <div className="space-y-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Add comment... Use #todo_abc to reference a task"
                  rows={4}
                  className="w-full resize-none rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Cmd/Ctrl + Enter to send
                  </span>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity',
                      !canSubmit && 'cursor-not-allowed opacity-50'
                    )}
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Toast show={toastVisible} message="Comment added" />
    </>
  );
}
