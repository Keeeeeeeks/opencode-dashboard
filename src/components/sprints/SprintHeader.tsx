'use client';

import { addDays, format, isSameYear } from 'date-fns';
import { Calendar, Target, Zap } from 'lucide-react';
import type { Sprint } from '@/lib/db/types';

type SprintStatus = 'planning' | 'active' | 'completed';

const STATUS_CONFIG: Record<SprintStatus, { label: string; bg: string; color: string; icon: string }> = {
  planning: { label: 'Planning', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', icon: '◷' },
  active: { label: 'Active', bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', icon: '●' },
  completed: { label: 'Completed', bg: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', icon: '✓' },
};

function formatSprintRange(startSeconds: number, sprintLengthDays = 14): string {
  const start = new Date(startSeconds * 1000);
  const end = addDays(start, sprintLengthDays);
  const now = new Date();

  if (isSameYear(start, end)) {
    if (isSameYear(start, now)) {
      return `${format(start, 'MMM d')} \u2013 ${format(end, 'MMM d')}`;
    }
    return `${format(start, 'MMM d')} \u2013 ${format(end, 'MMM d, yyyy')}`;
  }
  return `${format(start, 'MMM d, yyyy')} \u2013 ${format(end, 'MMM d, yyyy')}`;
}

interface SprintHeaderProps {
  sprint: Sprint;
}

export function SprintHeader({ sprint }: SprintHeaderProps) {
  const statusCfg = STATUS_CONFIG[sprint.status];
  const dateRange = formatSprintRange(sprint.start_date);

  return (
    <div
      className="mb-4 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-300"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: statusCfg.bg }}
          >
            <Zap className="h-4 w-4" style={{ color: statusCfg.color }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3
                className="text-sm font-semibold tracking-tight truncate"
                style={{ color: 'var(--text-strong)' }}
              >
                {sprint.name}
              </h3>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider shrink-0"
                style={{
                  background: statusCfg.bg,
                  color: statusCfg.color,
                }}
              >
                <span className="text-[9px] leading-none">{statusCfg.icon}</span>
                {statusCfg.label}
              </span>
            </div>
            {sprint.goal && (
              <p
                className="mt-1 text-sm italic leading-relaxed line-clamp-2"
                style={{ color: 'var(--muted)' }}
              >
                <Target className="mr-1.5 inline-block h-3.5 w-3.5 -translate-y-px" />
                {sprint.goal}
              </p>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium tabular-nums"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--muted)',
          }}
        >
          <Calendar className="h-3.5 w-3.5" />
          {dateRange}
        </div>
      </div>
    </div>
  );
}
