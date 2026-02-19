'use client';

import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Bot, Cpu, Moon, Square, Unlock, RotateCcw, Activity, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EnrichedAgent } from '@/stores/dashboard';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

const statusConfig: Record<
  EnrichedAgent['status'],
  { color: string; bg: string; label: string }
> = {
  working: { color: 'var(--ok)', bg: 'rgba(34, 197, 94, 0.12)', label: 'Working' },
  idle: { color: 'var(--muted)', bg: 'rgba(113, 113, 122, 0.12)', label: 'Idle' },
  blocked: { color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)', label: 'Blocked' },
  sleeping: { color: 'var(--warn)', bg: 'rgba(245, 158, 11, 0.12)', label: 'Sleeping' },
  offline: { color: '#52525b', bg: 'rgba(82, 82, 91, 0.12)', label: 'Offline' },
};

interface AgentCardProps {
  agent: EnrichedAgent;
  onSelect: (agent: EnrichedAgent) => void;
  onActionComplete: () => void;
}

export function AgentCard({ agent, onSelect, onActionComplete }: AgentCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const status = statusConfig[agent.status];

  const handleAction = useCallback(
    async (action: 'sleep' | 'stop' | 'unblock' | 'restart', e: React.MouseEvent) => {
      e.stopPropagation();
      setActionLoading(action);
      try {
        const res = await fetch(`${API_BASE}/api/agents/${agent.id}/actions`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          onActionComplete();
        }
      } catch (err) {
        console.error('Agent action failed:', err);
      } finally {
        setActionLoading(null);
      }
    },
    [agent.id, onActionComplete]
  );

  const heartbeatText = agent.last_heartbeat
    ? formatDistanceToNow(agent.last_heartbeat * 1000, { addSuffix: true })
    : 'Never';

  return (
    <div
      onClick={() => onSelect(agent)}
      className="group relative rounded-xl p-4 cursor-pointer transition-all"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {agent.status === 'working' && (
        <span
          className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full"
          style={{
            background: status.color,
            boxShadow: `0 0 8px ${status.color}`,
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
        />
      )}
      {agent.status !== 'working' && (
        <span
          className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full"
          style={{ background: status.color, opacity: 0.7 }}
        />
      )}

      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: agent.type === 'primary' ? 'var(--accent-subtle)' : 'rgba(59, 130, 246, 0.1)',
            color: agent.type === 'primary' ? 'var(--accent)' : 'var(--info)',
          }}
        >
          {agent.type === 'primary' ? <Bot className="h-5 w-5" /> : <Cpu className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <h3
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--text-strong)' }}
          >
            {agent.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wider"
              style={{
                background: agent.type === 'primary' ? 'var(--accent-subtle)' : 'rgba(59, 130, 246, 0.1)',
                color: agent.type === 'primary' ? 'var(--accent)' : 'var(--info)',
              }}
            >
              {agent.type}
            </span>
            <span
              className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium"
              style={{ background: status.bg, color: status.color }}
            >
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {agent.current_task && (
        <div
          className="rounded-lg px-3 py-2 mb-3"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
          }}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: 'var(--muted)' }}>
            Current Task
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text)' }}>
            {agent.current_task.title}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--muted)' }}>
        {agent.sub_agent_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {agent.sub_agent_count}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {heartbeatText}
        </span>
      </div>

      <div
        className={cn(
          'flex items-center gap-1 mt-3 pt-3 opacity-0 group-hover:opacity-100 transition-opacity',
        )}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <ActionBtn
          icon={<Moon className="h-3.5 w-3.5" />}
          label="Sleep"
          loading={actionLoading === 'sleep'}
          disabled={agent.status === 'sleeping' || agent.status === 'offline'}
          onClick={(e) => handleAction('sleep', e)}
        />
        <ActionBtn
          icon={<Square className="h-3.5 w-3.5" />}
          label="Stop"
          loading={actionLoading === 'stop'}
          disabled={agent.status === 'offline'}
          onClick={(e) => handleAction('stop', e)}
          danger
        />
        {agent.status === 'blocked' && (
          <ActionBtn
            icon={<Unlock className="h-3.5 w-3.5" />}
            label="Unblock"
            loading={actionLoading === 'unblock'}
            onClick={(e) => handleAction('unblock', e)}
            accent
          />
        )}
        <ActionBtn
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label="Restart"
          loading={actionLoading === 'restart'}
          disabled={agent.status === 'idle'}
          onClick={(e) => handleAction('restart', e)}
        />
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  loading,
  disabled,
  danger,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const color = danger ? 'var(--danger)' : accent ? 'var(--accent-2)' : 'var(--muted)';
  const hoverBg = danger
    ? 'rgba(239, 68, 68, 0.1)'
    : accent
      ? 'rgba(20, 184, 166, 0.1)'
      : 'var(--bg-hover)';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40"
      style={{ color, background: 'transparent' }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      title={label}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 rounded-full border-2 border-current animate-spin"
          style={{ borderTopColor: 'transparent' }}
        />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
