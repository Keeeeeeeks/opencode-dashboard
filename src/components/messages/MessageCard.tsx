'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, AlertCircle, RefreshCw, MessageSquare, FileText, Check } from 'lucide-react';
import type { MessageCardProps, Message } from './types';
import { MessageContent } from './MessageContent';

const typeConfig: Record<
  Message['type'],
  { icon: typeof CheckCircle; color: string; borderColor: string }
> = {
  task_complete: {
    icon: CheckCircle,
    color: '#22c55e',
    borderColor: '#22c55e',
  },
  error: {
    icon: AlertCircle,
    color: '#ef4444',
    borderColor: '#ef4444',
  },
  state_change: {
    icon: RefreshCw,
    color: '#3b82f6',
    borderColor: '#3b82f6',
  },
  custom: {
    icon: MessageSquare,
    color: '#14b8a6',
    borderColor: '#14b8a6',
  },
  worklog: {
    icon: FileText,
    color: '#a855f7',
    borderColor: '#a855f7',
  },
};

export function MessageCard({ message, onMarkAsRead }: MessageCardProps) {
  const config = typeConfig[message.type];
  const Icon = config.icon;
  const isRead = message.read === true || message.read === 1;

  return (
    <div
      className="group relative rounded-lg p-3 transition-all duration-200"
      style={{
        background: !isRead ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${config.borderColor}`,
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5" style={{ color: config.color }}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            <MessageContent content={message.content} />
          </p>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {formatDistanceToNow(message.created_at * 1000, { addSuffix: true })}
            </span>

            {!isRead && (
              <button
                onClick={() => onMarkAsRead(message.id)}
                className="flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <Check className="h-3 w-3" />
                Mark read
              </button>
            )}
          </div>
        </div>

        {!isRead && (
          <div className="absolute top-3 right-3">
            <span
              className="flex h-2 w-2 rounded-full animate-pulse-glow"
              style={{ background: 'var(--accent)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
