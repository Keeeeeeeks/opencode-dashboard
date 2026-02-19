'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { X, Bot, Cpu, Activity, Clock, Users, FileText, Wrench, Settings2 } from 'lucide-react';
import type { EnrichedAgent } from '@/stores/dashboard';
import type { Agent, AgentTask } from '@/lib/db/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

interface AgentDetail {
  agent: Agent & { age_seconds: number; skills: unknown; config: unknown };
  task_history: AgentTask[];
  sub_agents: Agent[];
}

interface AgentDetailModalProps {
  agent: EnrichedAgent | null;
  open: boolean;
  onClose: () => void;
}

const taskStatusColors: Record<string, { color: string; bg: string }> = {
  pending: { color: 'var(--muted)', bg: 'rgba(113, 113, 122, 0.12)' },
  in_progress: { color: 'var(--info)', bg: 'rgba(59, 130, 246, 0.12)' },
  blocked: { color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' },
  completed: { color: 'var(--ok)', bg: 'rgba(34, 197, 94, 0.12)' },
  cancelled: { color: '#52525b', bg: 'rgba(82, 82, 91, 0.12)' },
};

export function AgentDetailModal({ agent, open, onClose }: AgentDetailModalProps) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (agentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
        headers: authHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error('Failed to fetch agent detail:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && agent) {
      fetchDetail(agent.id);
    } else {
      setDetail(null);
    }
  }, [open, agent, fetchDetail]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !agent) return null;

  const skills = detail?.agent.skills;
  const config = detail?.agent.config;
  const parsedSkills = Array.isArray(skills) ? skills : typeof skills === 'string' ? [skills] : [];
  const parsedConfig =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between p-5 pb-4 backdrop-blur-sm"
          style={{
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{
                background: agent.type === 'primary' ? 'var(--accent-subtle)' : 'rgba(59, 130, 246, 0.1)',
                color: agent.type === 'primary' ? 'var(--accent)' : 'var(--info)',
              }}
            >
              {agent.type === 'primary' ? <Bot className="h-5 w-5" /> : <Cpu className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
                {agent.name}
              </h2>
              <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                {agent.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div
              className="mx-auto h-8 w-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
            />
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>Loading agent details...</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <InfoCell icon={<Activity className="h-3.5 w-3.5" />} label="Status" value={agent.status} />
              <InfoCell icon={<Clock className="h-3.5 w-3.5" />} label="Last Heartbeat"
                value={agent.last_heartbeat ? formatDistanceToNow(agent.last_heartbeat * 1000, { addSuffix: true }) : 'Never'} />
              <InfoCell icon={<Users className="h-3.5 w-3.5" />} label="Sub-agents" value={String(agent.sub_agent_count)} />
              <InfoCell icon={<Clock className="h-3.5 w-3.5" />} label="Age"
                value={detail ? `${Math.floor(detail.agent.age_seconds / 3600)}h ${Math.floor((detail.agent.age_seconds % 3600) / 60)}m` : '...'} />
            </div>

            {parsedSkills.length > 0 && (
              <DetailSection icon={<Wrench className="h-4 w-4" />} title="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {parsedSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: 'rgba(20, 184, 166, 0.1)',
                        color: '#14b8a6',
                      }}
                    >
                      {String(skill)}
                    </span>
                  ))}
                </div>
              </DetailSection>
            )}

            {parsedConfig && Object.keys(parsedConfig).length > 0 && (
              <DetailSection icon={<Settings2 className="h-4 w-4" />} title="Config">
                <pre
                  className="rounded-lg p-3 text-xs font-mono overflow-x-auto"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {JSON.stringify(parsedConfig, null, 2)}
                </pre>
              </DetailSection>
            )}

            {detail && detail.task_history.length > 0 && (
              <DetailSection icon={<FileText className="h-4 w-4" />} title={`Task History (${detail.task_history.length})`}>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {detail.task_history.map((task) => {
                    const tStatus = taskStatusColors[task.status] || taskStatusColors.pending;
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <span
                          className="inline-flex shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium"
                          style={{ background: tStatus.bg, color: tStatus.color }}
                        >
                          {task.status}
                        </span>
                        <p className="flex-1 text-xs truncate" style={{ color: 'var(--text)' }}>
                          {task.title}
                        </p>
                        <span className="shrink-0 text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                          {formatDistanceToNow(task.created_at * 1000, { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </DetailSection>
            )}

            {detail && detail.sub_agents.length > 0 && (
              <DetailSection icon={<Users className="h-4 w-4" />} title={`Sub-agents (${detail.sub_agents.length})`}>
                <div className="space-y-2">
                  {detail.sub_agents.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Cpu className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--info)' }} />
                      <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                        {sub.name}
                      </span>
                      <span
                        className="inline-flex rounded-full px-1.5 py-px text-[10px] font-medium"
                        style={{
                          background: (taskStatusColors[sub.status] || taskStatusColors.pending).bg,
                          color: (taskStatusColors[sub.status] || taskStatusColors.pending).color,
                        }}
                      >
                        {sub.status}
                      </span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--muted)' }}>
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-strong)' }}>
        {value}
      </p>
    </div>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-strong)' }}>
        <span style={{ color: 'var(--muted)' }}>{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
