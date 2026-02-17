'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SprintVelocity } from '@/lib/db/types';
import { BurndownChart } from './BurndownChart';

type SprintStatus = 'planning' | 'active' | 'completed';

const STATUS_CONFIG: Record<SprintStatus, { label: string; bg: string; color: string }> = {
  planning: { label: 'Planning', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
  active: { label: 'Active', bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
  completed: { label: 'Completed', bg: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' },
};

const STATUS_ORDER: SprintStatus[] = ['planning', 'active', 'completed'];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  return headers;
}

interface VelocityWidgetProps {
  sprintId: string;
  sprintName: string;
  sprintStatus?: SprintStatus;
}

export function VelocityWidget({ sprintId, sprintName, sprintStatus = 'planning' }: VelocityWidgetProps) {
  const [velocity, setVelocity] = useState<SprintVelocity | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStatus, setCurrentStatus] = useState<SprintStatus>(sprintStatus);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentStatus(sprintStatus);
  }, [sprintStatus]);

  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statusDropdownOpen]);

  const updateSprintStatus = useCallback(async (newStatus: SprintStatus) => {
    if (newStatus === currentStatus || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${API_BASE}/api/sprints/${sprintId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCurrentStatus(newStatus);
      }
    } catch {
    } finally {
      setUpdatingStatus(false);
      setStatusDropdownOpen(false);
    }
  }, [sprintId, currentStatus, updatingStatus]);

  const fetchVelocity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sprints/${sprintId}/velocity`, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error('Failed to fetch sprint velocity');
      }

      const data = await res.json();
      setVelocity(data.velocity ?? null);
    } catch (error) {
      console.error('Velocity fetch error:', error);
      setVelocity(null);
    } finally {
      setLoading(false);
    }
  }, [sprintId]);

  useEffect(() => {
    setLoading(true);
    fetchVelocity();

    const interval = setInterval(fetchVelocity, 3000);
    return () => clearInterval(interval);
  }, [fetchVelocity]);

  if (loading) {
    return <div className="h-44 rounded-lg animate-skeleton" />;
  }

  if (!velocity) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          Sprint Velocity
        </h3>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Unable to load velocity for {sprintName}
        </p>
      </div>
    );
  }

  const progress = velocity.total_points > 0 ? Math.round((velocity.completed_points / velocity.total_points) * 100) : 0;

  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-strong)' }}>
            {velocity.sprint_name}
          </h3>
          <div className="relative shrink-0" ref={statusRef}>
            <button
              type="button"
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
              style={{
                background: STATUS_CONFIG[currentStatus].bg,
                color: STATUS_CONFIG[currentStatus].color,
              }}
              disabled={updatingStatus}
            >
              {STATUS_CONFIG[currentStatus].label}
              <ChevronDown className="h-3 w-3" />
            </button>
            {statusDropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 min-w-[130px] rounded-lg border py-1 shadow-lg"
                style={{
                  background: 'var(--card)',
                  borderColor: 'var(--border)',
                  boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0,0,0,.5))',
                }}
              >
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateSprintStatus(status)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                    style={{ color: currentStatus === status ? STATUS_CONFIG[status].color : 'var(--text)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: STATUS_CONFIG[status].color }}
                    />
                    {STATUS_CONFIG[status].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className="text-xs font-medium shrink-0" style={{ color: 'var(--muted)' }}>
          {progress}%
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%`, background: 'var(--accent)' }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md py-2" style={{ background: 'var(--card)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Total
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {velocity.total_points}
          </div>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--card)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Done
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {velocity.completed_points}
          </div>
        </div>
        <div className="rounded-md py-2" style={{ background: 'var(--card)' }}>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Left
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {Math.max(velocity.total_points - velocity.completed_points, 0)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <BurndownChart data={velocity.daily_progress} totalPoints={velocity.total_points} />
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
        🔴 High (5pts) 🟡 Med (3pts) 🟢 Low (1pt)
      </p>
    </div>
  );
}
