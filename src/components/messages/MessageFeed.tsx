'use client';

import { MessageCard } from './MessageCard';
import { Bell, CheckCheck } from 'lucide-react';
import type { MessageFeedProps } from './types';

export function MessageFeed({ messages, onMarkAsRead, isLoading }: MessageFeedProps) {
  const unreadCount = messages.filter((m) => !m.read && m.read !== 1).length;

  const handleMarkAllAsRead = () => {
    const unreadIds = messages
      .filter((m) => !m.read && m.read !== 1)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      onMarkAsRead(unreadIds);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 stagger-children">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg animate-skeleton"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between pb-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" style={{ color: 'var(--muted)' }} />
          <h2
            className="font-semibold text-sm"
            style={{ color: 'var(--text-strong)' }}
          >
            Messages
          </h2>
          {unreadCount > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mt-3 space-y-2">
        {messages.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-48"
            style={{ color: 'var(--muted)' }}
          >
            <Bell className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm opacity-60">No messages yet</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              onMarkAsRead={(id) => onMarkAsRead([id])}
            />
          ))
        )}
      </div>
    </div>
  );
}
