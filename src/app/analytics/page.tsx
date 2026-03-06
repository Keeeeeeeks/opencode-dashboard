'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Moon, Sun } from 'lucide-react';
import { subDays } from 'date-fns';
import type { Sprint } from '@/lib/db/types';
import { BarChart } from '@/components/analytics/BarChart';
import { DonutChart } from '@/components/analytics/DonutChart';
import { HorizontalBarChart } from '@/components/analytics/HorizontalBarChart';
import { LineChart } from '@/components/analytics/LineChart';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Toast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_KEY = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  return headers;
}

type DatePreset = '7d' | '30d' | '90d' | 'custom';

type AnalyticsResponse = {
  period: { start: number; end: number };
  throughput: {
    weekly: Array<{ week: string; completed: number }>;
  };
  cycle_time: {
    average_seconds: number;
    median_seconds: number;
    entries: Array<{ todo_id: string; seconds: number }>;
    weekly?: Array<{ week: string; average_seconds: number }>;
  };
  lead_time: {
    average_seconds: number;
    median_seconds: number;
  };
  created_vs_completed: {
    weekly: Array<{ week: string; created: number; completed: number }>;
  };
  status_distribution: Record<string, number>;
  priority_distribution: Record<string, number>;
  agent_workload: Array<{ agent: string; total: number; completed: number; in_progress: number }>;
  velocity_trend: Array<{ sprint_id: string; sprint_name: string; total_points: number; completed_points: number }>;
};

type TodoFilterRecord = {
  project?: string | null;
  agent?: string | null;
};

function weekTick(week: string): string {
  const parts = week.split('-');
  return parts[1] ?? week;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function dateToInput(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function inputToUnix(dateValue: string, endOfDay = false): number {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 0);
  }
  return Math.floor(date.getTime() / 1000);
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '0h';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${Math.max(hours, 1)}h`;
}

export default function AnalyticsPage() {
  const [isDark, setIsDark] = useState(true);
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [customStart, setCustomStart] = useState(dateToInput(Math.floor(subDays(new Date(), 30).getTime() / 1000)));
  const [customEnd, setCustomEnd] = useState(dateToInput(nowUnix()));
  const [selectedSprint, setSelectedSprint] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewSprintId, setReviewSprintId] = useState<string | null>(null);
  const [reviewToastVisible, setReviewToastVisible] = useState(false);

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const reviewMarkedSprintRef = useRef<string | null>(null);

  useEffect(() => {
    const hasLight = document.documentElement.classList.contains('light');
    setIsDark(!hasLight);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sprintId = params.get('sprint_id');
    const shouldReview = params.get('review') === 'true';

    if (sprintId) {
      setSelectedSprint(sprintId);
    }

    if (shouldReview && sprintId) {
      setReviewMode(true);
      setReviewSprintId(sprintId);
    }
  }, []);

  useEffect(() => {
    let canceled = false;

    async function fetchFilterData() {
      try {
        const [sprintsRes, todosRes] = await Promise.all([
          fetch(`${API_BASE}/api/sprints`, { headers: authHeaders() }),
          fetch(`${API_BASE}/api/todos`, { headers: authHeaders() }),
        ]);

        if (canceled) {
          return;
        }

        if (sprintsRes.ok) {
          const sprintData = (await sprintsRes.json()) as { sprints: Sprint[] };
          setSprints(sprintData.sprints ?? []);
        }

        if (todosRes.ok) {
          const todoData = (await todosRes.json()) as { todos: TodoFilterRecord[] };
          const todoItems = todoData.todos ?? [];

          const projectSet = new Set<string>();
          const agentSet = new Set<string>();

          for (const todo of todoItems) {
            if (todo.project) {
              projectSet.add(todo.project);
            }
            if (todo.agent) {
              agentSet.add(todo.agent);
            }
          }

          setProjects(Array.from(projectSet).sort());
          setAgents(Array.from(agentSet).sort());
        }
      } catch (error) {
        console.error('Failed to load analytics filters:', error);
      }
    }

    void fetchFilterData();

    return () => {
      canceled = true;
    };
  }, []);

  const period = useMemo(() => {
    const end = nowUnix();

    if (preset === '7d') {
      return { start: Math.floor(subDays(new Date(), 7).getTime() / 1000), end };
    }
    if (preset === '90d') {
      return { start: Math.floor(subDays(new Date(), 90).getTime() / 1000), end };
    }
    if (preset === 'custom') {
      return {
        start: inputToUnix(customStart),
        end: inputToUnix(customEnd, true),
      };
    }
    return { start: Math.floor(subDays(new Date(), 30).getTime() / 1000), end };
  }, [customEnd, customStart, preset]);

  useEffect(() => {
    let canceled = false;

    async function fetchAnalytics() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          start: String(period.start),
          end: String(period.end),
        });

        if (selectedSprint) {
          params.set('sprint_id', selectedSprint);
        }
        if (selectedProject) {
          params.set('project', selectedProject);
        }
        if (selectedAgent) {
          params.set('agent', selectedAgent);
        }

        const res = await fetch(`${API_BASE}/api/analytics?${params.toString()}`, {
          headers: authHeaders(),
        });

        if (!res.ok) {
          throw new Error('Failed to fetch analytics');
        }

        const payload = (await res.json()) as AnalyticsResponse;
        if (!canceled) {
          setAnalytics(payload);
        }
      } catch (error) {
        console.error('Analytics fetch error:', error);
        if (!canceled) {
          setAnalytics(null);
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    void fetchAnalytics();

    return () => {
      canceled = true;
    };
  }, [period.end, period.start, selectedAgent, selectedProject, selectedSprint]);

  useEffect(() => {
    if (!reviewMode || !reviewSprintId || reviewMarkedSprintRef.current === reviewSprintId) {
      return;
    }

    let canceled = false;
    const targetSprintId = reviewSprintId;

    async function markSprintAsReviewed() {
      try {
        const response = await fetch(`${API_BASE}/api/sprints/${encodeURIComponent(targetSprintId)}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            reviewed_at: Math.floor(Date.now() / 1000),
            status: 'completed',
          }),
        });

        if (!response.ok || canceled) {
          return;
        }

        const payload = (await response.json()) as { sprint: Sprint };
        if (canceled) {
          return;
        }

        reviewMarkedSprintRef.current = targetSprintId;
        if (payload.sprint) {
          setSprints((prev) => prev.map((sprint) => (sprint.id === payload.sprint.id ? payload.sprint : sprint)));
        }
        setReviewToastVisible(true);
        window.setTimeout(() => setReviewToastVisible(false), 2200);
      } catch (error) {
        console.error('Failed to mark sprint as reviewed:', error);
      }
    }

    void markSprintAsReviewed();

    return () => {
      canceled = true;
    };
  }, [reviewMode, reviewSprintId]);

  const summary = useMemo(() => {
    if (!analytics) {
      return {
        total: 0,
        completed: 0,
        cycle: 0,
        lead: 0,
        completionRate: 0,
      };
    }

    const total = analytics.created_vs_completed.weekly.reduce((sum, week) => sum + week.created, 0);
    const completed = analytics.created_vs_completed.weekly.reduce((sum, week) => sum + week.completed, 0);
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      cycle: analytics.cycle_time.average_seconds,
      lead: analytics.lead_time.average_seconds,
      completionRate,
    };
  }, [analytics]);

  const toggleDark = () => {
    document.documentElement.classList.toggle('light');
    setIsDark(!isDark);
  };

  const reviewSprint = useMemo(() => {
    if (!reviewMode) {
      return null;
    }
    const targetId = reviewSprintId || selectedSprint;
    if (!targetId) {
      return null;
    }
    return sprints.find((sprint) => sprint.id === targetId) ?? null;
  }, [reviewMode, reviewSprintId, selectedSprint, sprints]);

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <header
          className="sticky top-0 z-50 border-b backdrop-blur-xl"
          style={{
            background: 'var(--chrome)',
            borderColor: 'var(--border)',
            height: 56,
          }}
        >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                style={{
                  background: 'var(--accent-subtle)',
                  boxShadow: '0 0 20px var(--accent-glow)',
                }}
              >
                📈
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
                  Analytics
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Linear-style delivery metrics
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors"
                style={{
                  background: 'var(--bg-hover)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                Back to Dashboard
              </Link>

              <button type="button" onClick={toggleDark} className="rounded-lg p-2 transition-colors" style={{ color: 'var(--muted)' }}>
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-dashboard-enter">
        {reviewMode ? (
          <div
            className="mb-5 rounded-lg border px-4 py-3"
            style={{
              background: 'linear-gradient(90deg, rgba(251, 191, 36, 0.1), rgba(217, 119, 6, 0.12))',
              borderColor: 'rgba(217, 119, 6, 0.4)',
            }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#fbbf24' }}>
              <CheckCircle2 className="h-4 w-4" />
              Sprint Review: {reviewSprint?.name ?? reviewSprintId ?? selectedSprint}
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text)' }}>
              This sprint is in review mode and is being finalized as completed.
            </p>
          </div>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreset('7d')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: preset === '7d' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: preset === '7d' ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${preset === '7d' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => setPreset('30d')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: preset === '30d' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: preset === '30d' ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${preset === '30d' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Last 30 days
            </button>
            <button
              type="button"
              onClick={() => setPreset('90d')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: preset === '90d' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: preset === '90d' ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${preset === '90d' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Last 90 days
            </button>
            <button
              type="button"
              onClick={() => setPreset('custom')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: preset === 'custom' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: preset === 'custom' ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${preset === 'custom' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              Custom
            </button>

            {preset === 'custom' ? (
              <div className="ml-1 flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-md px-2 py-1.5 text-xs outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-md px-2 py-1.5 text-xs outline-none"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSprint}
              onChange={(event) => setSelectedSprint(event.target.value)}
              className="rounded-md px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="">All Sprints</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>

            <select
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className="rounded-md px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className="rounded-md px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="">All Agents</option>
              {agents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {loading ? (
            ['skeleton-total', 'skeleton-completed', 'skeleton-cycle', 'skeleton-lead', 'skeleton-rate'].map((key) => (
              <div key={key} className="h-24 rounded-xl animate-skeleton" />
            ))
          ) : (
            <>
              <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Total tasks</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>{summary.total}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Completed</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>{summary.completed}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Avg cycle time</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>{formatDuration(summary.cycle)}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Avg lead time</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>{formatDuration(summary.lead)}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Completion rate</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-strong)' }}>{summary.completionRate}%</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Throughput</h3>
            {loading ? (
              <div className="h-56 rounded-lg animate-skeleton" />
            ) : (
              <BarChart
                data={(analytics?.throughput.weekly ?? []).map((item) => ({
                  label: weekTick(item.week),
                  values: [{ key: 'completed', value: item.completed, color: 'var(--accent)' }],
                }))}
                yLabel="Tasks"
              />
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Created vs Completed</h3>
            {loading ? (
              <div className="h-56 rounded-lg animate-skeleton" />
            ) : (
              <BarChart
                data={(analytics?.created_vs_completed.weekly ?? []).map((item) => ({
                  label: weekTick(item.week),
                  values: [
                    { key: 'created', value: item.created, color: 'var(--muted)' },
                    { key: 'completed', value: item.completed, color: 'var(--accent)' },
                  ],
                }))}
                yLabel="Tasks"
              />
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Cycle Time Trend</h3>
            {loading ? (
              <div className="h-56 rounded-lg animate-skeleton" />
            ) : (
              <LineChart
                data={(analytics?.cycle_time.weekly ?? []).map((item) => ({
                  label: weekTick(item.week),
                  value: Math.round(item.average_seconds / 3600),
                }))}
                yLabel="Hours"
                showArea
              />
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Status Distribution</h3>
            {loading ? (
              <div className="h-56 rounded-lg animate-skeleton" />
            ) : (
              <DonutChart
                data={Object.entries(analytics?.status_distribution ?? {}).map(([status, value]) => ({
                  label: status,
                  value,
                  color:
                    status === 'pending'
                      ? '#71717a'
                      : status === 'in_progress'
                        ? '#3b82f6'
                        : status === 'blocked'
                          ? '#f59e0b'
                          : status === 'completed'
                            ? '#22c55e'
                            : status === 'cancelled'
                              ? '#ef4444'
                              : '#38bdf8',
                }))}
              />
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Priority Distribution</h3>
            {loading ? (
              <div className="h-56 rounded-lg animate-skeleton" />
            ) : (
              <HorizontalBarChart
                data={[
                  {
                    label: 'High',
                    segments: [{ key: 'high', value: analytics?.priority_distribution.high ?? 0, color: '#ef4444' }],
                  },
                  {
                    label: 'Medium',
                    segments: [{ key: 'medium', value: analytics?.priority_distribution.medium ?? 0, color: '#f59e0b' }],
                  },
                  {
                    label: 'Low',
                    segments: [{ key: 'low', value: analytics?.priority_distribution.low ?? 0, color: '#22c55e' }],
                  },
                ]}
              />
            )}
          </div>

          {analytics && analytics.velocity_trend.length > 0 ? (
            <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Velocity Trend</h3>
              {loading ? (
                <div className="h-56 rounded-lg animate-skeleton" />
              ) : (
                <BarChart
                  data={analytics.velocity_trend.map((item) => ({
                    label: item.sprint_name,
                    values: [
                      { key: 'total', value: item.total_points, color: 'var(--muted)' },
                      { key: 'completed', value: item.completed_points, color: 'var(--accent)' },
                    ],
                  }))}
                  yLabel="Points"
                />
              )}
            </div>
          ) : null}

          {analytics && analytics.agent_workload.length > 0 ? (
            <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Agent Workload</h3>
              {loading ? (
                <div className="h-56 rounded-lg animate-skeleton" />
              ) : (
                <HorizontalBarChart
                  data={analytics.agent_workload.map((item) => ({
                    label: item.agent,
                    segments: [
                      { key: 'completed', value: item.completed, color: '#22c55e' },
                      { key: 'in_progress', value: item.in_progress, color: '#3b82f6' },
                      {
                        key: 'other',
                        value: Math.max(item.total - item.completed - item.in_progress, 0),
                        color: '#71717a',
                      },
                    ],
                  }))}
                />
              )}
            </div>
          ) : null}
        </div>
        </main>

        <Toast show={reviewToastVisible} message="Sprint marked as reviewed" />
      </div>
    </AuthGuard>
  );
}
