'use client';

import { ExternalLink } from 'lucide-react';
import type { LinearIssue } from '@/lib/db/types';

const priorityConfig: Record<number, { color: string; label: string }> = {
  0: { color: 'var(--muted)', label: 'None' },
  1: { color: 'var(--danger)', label: 'Urgent' },
  2: { color: '#f97316', label: 'High' },
  3: { color: 'var(--warn)', label: 'Medium' },
  4: { color: 'var(--info)', label: 'Low' },
};

interface LinearIssueCardProps {
  issue: LinearIssue;
}

export function LinearIssueCard({ issue }: LinearIssueCardProps) {
  const priority = priorityConfig[issue.priority] || priorityConfig[0];
  const labels = issue.label_names ? issue.label_names.split(',').map((l) => l.trim()).filter(Boolean) : [];

  return (
    <div
      className="group rounded-lg p-3 transition-all cursor-default"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: priority.color }}
            title={priority.label}
          />
          {issue.identifier && (
            <span className="text-[11px] font-mono font-medium shrink-0" style={{ color: 'var(--muted)' }}>
              {issue.identifier}
            </span>
          )}
        </div>
        {issue.url && (
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--muted)';
            }}
            onClick={(e) => e.stopPropagation()}
            title="Open in Linear"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--text-strong)' }}>
        {issue.title}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex rounded-full px-1.5 py-px text-[10px] font-medium"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#a78bfa',
            }}
          >
            {label}
          </span>
        ))}

        {issue.estimate !== null && issue.estimate > 0 && (
          <span
            className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-mono font-medium"
            style={{
              background: 'rgba(20, 184, 166, 0.1)',
              color: '#14b8a6',
            }}
          >
            {issue.estimate}pt
          </span>
        )}
      </div>

      {issue.assignee_name && (
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          {issue.assignee_avatar ? (
            <img
              src={issue.assignee_avatar}
              alt={issue.assignee_name}
              className="h-4 w-4 rounded-full"
            />
          ) : (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold uppercase"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              {issue.assignee_name.charAt(0)}
            </span>
          )}
          <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
            {issue.assignee_name}
          </span>
        </div>
      )}
    </div>
  );
}
