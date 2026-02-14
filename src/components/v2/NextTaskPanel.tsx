'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import type { NextTaskPanelProps } from './types';

export function NextTaskPanel({ task, onStartWorking, onOpenTask }: NextTaskPanelProps) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          Next Up
        </h3>
      </div>

      {!task ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          No pending task is ready. Resolve blockers or dependencies first.
        </p>
      ) : (
        <div className="space-y-3">
          <button
            className="w-full text-left rounded-lg border p-3 transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
            onClick={() => onOpenTask(task)}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {task.title}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Priority: {task.priority} - All dependencies are satisfied.
            </p>
          </button>

          <button
            onClick={() => onStartWorking(task)}
            className="w-full rounded-lg px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Start Working
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
