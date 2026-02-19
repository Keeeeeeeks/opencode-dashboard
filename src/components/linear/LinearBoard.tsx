'use client';

import { useState, useMemo, useCallback } from 'react';
import { RefreshCw, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard';
import type { LinearIssue } from '@/lib/db/types';
import { LinearIssueCard } from './LinearIssueCard';
import { LinearProjectSelector } from './LinearProjectSelector';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

interface LinearBoardProps {
  onRefresh: () => void;
}

export function LinearBoard({ onRefresh }: LinearBoardProps) {
  const linearProjects = useDashboardStore((s) => s.linearProjects);
  const linearIssues = useDashboardStore((s) => s.linearIssues);
  const linearWorkflowStates = useDashboardStore((s) => s.linearWorkflowStates);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/api/linear/sync`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      onRefresh();
    } catch (err) {
      console.error('Linear sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [onRefresh]);

  const filteredIssues = useMemo(() => {
    if (!selectedProjectId) return linearIssues;
    return linearIssues.filter((issue) => issue.project_id === selectedProjectId);
  }, [linearIssues, selectedProjectId]);

  const sortedStates = useMemo(() => {
    return [...linearWorkflowStates].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [linearWorkflowStates]);

  const issuesByState = useMemo(() => {
    const map = new Map<string, LinearIssue[]>();
    for (const state of sortedStates) {
      map.set(state.name, []);
    }
    map.set('_unassigned', []);

    for (const issue of filteredIssues) {
      const key = issue.state_name || '_unassigned';
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(issue);
      } else {
        const unassigned = map.get('_unassigned');
        if (unassigned) unassigned.push(issue);
      }
    }

    return map;
  }, [filteredIssues, sortedStates]);

  const columnsToRender = useMemo(() => {
    const cols: { name: string; label: string; issues: LinearIssue[]; color: string | null }[] = [];
    for (const state of sortedStates) {
      const issues = issuesByState.get(state.name) || [];
      cols.push({ name: state.name, label: state.name, issues, color: state.color });
    }
    const unassigned = issuesByState.get('_unassigned') || [];
    if (unassigned.length > 0) {
      cols.push({ name: '_unassigned', label: 'Unassigned', issues: unassigned, color: null });
    }
    return cols.filter((c) => c.issues.length > 0);
  }, [sortedStates, issuesByState]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" style={{ color: '#5e6ad2' }} />
          <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
            Linear Board
          </h2>
          <span
            className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono"
            style={{ background: 'rgba(94, 106, 210, 0.12)', color: '#5e6ad2' }}
          >
            {filteredIssues.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <LinearProjectSelector
            projects={linearProjects}
            selectedProjectId={selectedProjectId}
            onSelect={setSelectedProjectId}
          />
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              background: 'rgba(94, 106, 210, 0.1)',
              color: '#5e6ad2',
              border: '1px solid rgba(94, 106, 210, 0.2)',
            }}
            onMouseEnter={(e) => {
              if (!syncing) e.currentTarget.style.background = 'rgba(94, 106, 210, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(94, 106, 210, 0.1)';
            }}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {columnsToRender.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-16"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px dashed var(--border)',
          }}
        >
          <LayoutGrid className="h-10 w-10 mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            No Linear issues found
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            Click Sync to pull issues from Linear
          </p>
        </div>
      )}

      {columnsToRender.length > 0 && (
        <div
          className="flex gap-3 overflow-x-auto pb-4"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {columnsToRender.map((col) => (
            <div
              key={col.name}
              className="shrink-0 rounded-xl"
              style={{
                width: 280,
                minWidth: 280,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                scrollSnapAlign: 'start',
              }}
            >
              <div
                className="flex items-center gap-2 px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: col.color || 'var(--muted)' }}
                />
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-strong)' }}>
                  {col.label}
                </span>
                <span
                  className="ml-auto text-[10px] font-mono rounded-full px-1.5 py-px"
                  style={{ background: 'var(--bg-hover)', color: 'var(--muted)' }}
                >
                  {col.issues.length}
                </span>
              </div>

              <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                {col.issues.map((issue) => (
                  <LinearIssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
