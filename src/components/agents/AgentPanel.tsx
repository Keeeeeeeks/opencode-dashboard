'use client';

import { useState, useMemo } from 'react';
import { Bot, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard';
import type { EnrichedAgent } from '@/stores/dashboard';
import { AgentCard } from './AgentCard';
import { AgentDetailModal } from './AgentDetailModal';

type StatusFilter = 'all' | EnrichedAgent['status'];

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'working', label: 'Working' },
  { value: 'idle', label: 'Idle' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'offline', label: 'Offline' },
];

interface AgentPanelProps {
  onRefresh: () => void;
}

export function AgentPanel({ onRefresh }: AgentPanelProps) {
  const agents = useDashboardStore((s) => s.agents);
  const [selectedAgent, setSelectedAgent] = useState<EnrichedAgent | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredAgents = useMemo(() => {
    if (statusFilter === 'all') return agents;
    return agents.filter((a) => a.status === statusFilter);
  }, [agents, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    for (const agent of agents) {
      counts[agent.status] = (counts[agent.status] || 0) + 1;
    }
    return counts;
  }, [agents]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
            Agent Fleet
          </h2>
          <span
            className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            {agents.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" style={{ color: 'var(--muted)' }} />
          {filterOptions.map((opt) => {
            const isActive = statusFilter === opt.value;
            const count = statusCounts[opt.value] || 0;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                )}
                style={{
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--muted)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {opt.label}
                {count > 0 && (
                  <span className="ml-1 opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {filteredAgents.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-16"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px dashed var(--border)',
          }}
        >
          <Bot className="h-10 w-10 mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            {agents.length === 0 ? 'No agents registered yet' : 'No agents match this filter'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            Agents will appear here once they connect
          </p>
        </div>
      )}

      {filteredAgents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSelect={setSelectedAgent}
              onActionComplete={onRefresh}
            />
          ))}
        </div>
      )}

      <AgentDetailModal
        agent={selectedAgent}
        open={selectedAgent !== null}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
