'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Link2, UserPlus, Users } from 'lucide-react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuthStore } from '@/stores/auth';
import type { Project, User } from '@/lib/db/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type TeamResponse = { users: User[] };
type ProjectsResponse = { projects: Project[] };
type InviteLinkResponse = {
  invite: {
    id: string;
    url: string;
    role: 'admin' | 'viewer';
    expires_at: number;
  };
};

type Role = 'admin' | 'viewer';

function roleBadgeStyle(role: User['role']): CSSProperties {
  if (role === 'owner') {
    return {
      background: 'var(--accent-subtle)',
      border: '1px solid var(--accent)',
      color: 'var(--accent)',
    };
  }
  if (role === 'admin') {
    return {
      background: 'rgba(20, 184, 166, 0.15)',
      border: '1px solid #14b8a6',
      color: '#14b8a6',
    };
  }

  return {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
  };
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function formatCountdown(expiresAt: number): string {
  const remaining = expiresAt - Math.floor(Date.now() / 1000);
  if (remaining <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usernameInput, setUsernameInput] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<Role>('viewer');
  const [addingMember, setAddingMember] = useState(false);

  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string>('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);

  const isOwner = user?.role === 'owner';

  useEffect(() => {
    let cancelled = false;

    async function fetchSettingsData() {
      try {
        setLoading(true);
        setError(null);

        const requests: Promise<Response>[] = [
          fetch(`${API_BASE}/api/settings/projects`, { credentials: 'include' }),
        ];
        if (isOwner) {
          requests.push(fetch(`${API_BASE}/api/settings/team`, { credentials: 'include' }));
        }

        const responses = await Promise.all(requests);
        if (cancelled) {
          return;
        }

        const projectsRes = responses[0];
        if (!projectsRes.ok) {
          throw new Error('Failed to load projects');
        }
        const projectsData = (await projectsRes.json()) as ProjectsResponse;
        setProjects(projectsData.projects ?? []);

        if (isOwner) {
          const teamRes = responses[1];
          if (!teamRes?.ok) {
            throw new Error('Failed to load team');
          }
          const teamData = (await teamRes.json()) as TeamResponse;
          setUsers(teamData.users ?? []);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError('Failed to load settings data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchSettingsData();

    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  useEffect(() => {
    if (!inviteExpiresAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdownTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [inviteExpiresAt]);

  const inviteCountdown = useMemo(() => {
    if (!inviteExpiresAt) {
      return '';
    }
    return formatCountdown(inviteExpiresAt);
  }, [inviteExpiresAt, countdownTick]);

  async function refreshTeam() {
    const teamRes = await fetch(`${API_BASE}/api/settings/team`, { credentials: 'include' });
    if (!teamRes.ok) {
      throw new Error('Failed to refresh team');
    }
    const teamData = (await teamRes.json()) as TeamResponse;
    setUsers(teamData.users ?? []);
  }

  async function addMember() {
    const username = usernameInput.trim();
    if (!username || addingMember) {
      return;
    }

    try {
      setAddingMember(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/settings/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'direct',
          github_username: username,
          role: newMemberRole,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Failed to add member' }))) as {
          error?: string;
        };
        throw new Error(payload.error || 'Failed to add member');
      }

      setUsernameInput('');
      await refreshTeam();
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  async function removeMember(targetUser: User) {
    if (!user || targetUser.id === user.id) {
      return;
    }

    if (!window.confirm(`Remove ${targetUser.username} from the dashboard team?`)) {
      return;
    }

    try {
      setBusyUserId(targetUser.id);
      setError(null);

      const res = await fetch(`${API_BASE}/api/settings/team/${targetUser.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Failed to remove member' }))) as {
          error?: string;
        };
        throw new Error(payload.error || 'Failed to remove member');
      }

      await refreshTeam();
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove member');
    } finally {
      setBusyUserId(null);
    }
  }

  async function updateMemberRole(targetUser: User, role: Role) {
    if (!user || targetUser.id === user.id || targetUser.role === role) {
      return;
    }

    try {
      setBusyUserId(targetUser.id);
      setError(null);

      const res = await fetch(`${API_BASE}/api/settings/team/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Failed to update role' }))) as {
          error?: string;
        };
        throw new Error(payload.error || 'Failed to update role');
      }

      await refreshTeam();
    } catch (updateError) {
      console.error(updateError);
      setError(updateError instanceof Error ? updateError.message : 'Failed to update role');
    } finally {
      setBusyUserId(null);
    }
  }

  async function generateInviteLink() {
    try {
      setInviteLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/settings/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'link',
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({ error: 'Failed to generate invite link' }))) as {
          error?: string;
        };
        throw new Error(payload.error || 'Failed to generate invite link');
      }

      const data = (await res.json()) as InviteLinkResponse;
      const origin = window.location.origin;
      setInviteLink(`${origin}${data.invite.url}`);
      setInviteExpiresAt(data.invite.expires_at);
      setCopied(false);
    } catch (inviteError) {
      console.error(inviteError);
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to generate invite link');
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) {
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <header
          className="sticky top-0 z-50 border-b backdrop-blur-xl"
          style={{ background: 'var(--chrome)', borderColor: 'var(--border)', height: 56 }}
        >
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent-subtle)', boxShadow: '0 0 20px var(--accent-glow)' }}
              >
                <Users className="h-4 w-4" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
                  Settings
                </h1>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Team and project access
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: 'var(--bg-hover)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-dashboard-enter">
          {error ? (
            <div
              className="mb-4 rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.12)', color: '#fca5a5' }}
            >
              {error}
            </div>
          ) : null}

          {!isOwner ? (
            <div className="mb-6 rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Team management is available for owner accounts only.
              </p>
            </div>
          ) : null}

          {isOwner ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-strong)' }}>
                  Team
                </h2>
                <div className="mt-4 space-y-3">
                  {loading ? (
                    <div className="h-24 rounded-lg animate-skeleton" />
                  ) : users.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      No team members found.
                    </p>
                  ) : (
                    users.map((member) => {
                      const ownRow = member.id === user?.id;
                      return (
                        <div
                          key={member.id}
                          className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={member.avatar_url || '/branding/ocd-logo.png'}
                              alt={`${member.username} avatar`}
                              className="h-8 w-8 rounded-full"
                            />
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                                {member.username}
                              </p>
                              <span
                                className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                                style={roleBadgeStyle(member.role)}
                              >
                                {member.role}
                              </span>
                            </div>
                          </div>

                          <select
                            value={member.role === 'owner' ? 'owner' : member.role}
                            disabled={ownRow || member.role === 'owner' || busyUserId === member.id}
                            onChange={(event) => {
                              const nextRole = event.target.value as Role;
                              void updateMemberRole(member, nextRole);
                            }}
                            className="rounded-md px-2 py-1 text-xs outline-none"
                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          >
                            {member.role === 'owner' ? <option value="owner">Owner</option> : null}
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                          </select>

                          <button
                            onClick={() => void removeMember(member)}
                            disabled={ownRow || busyUserId === member.id}
                            className="rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              color: '#f87171',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-strong)' }}>
                  Add Member
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    placeholder="GitHub username"
                    className="rounded-md px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <select
                    value={newMemberRole}
                    onChange={(event) => setNewMemberRole(event.target.value as Role)}
                    className="rounded-md px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => void addMember()}
                    disabled={addingMember || !usernameInput.trim()}
                    className="inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: 'var(--text-strong)' }}
                  >
                    <UserPlus className="h-4 w-4" />
                    Add Member
                  </button>
                </div>

                <h3 className="mt-8 text-sm font-semibold tracking-wide" style={{ color: 'var(--text-strong)' }}>
                  Invite Link
                </h3>

                <div className="mt-4 grid gap-3 sm:grid-cols-[140px_auto]">
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as Role)}
                    className="rounded-md px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => void generateInviteLink()}
                    disabled={inviteLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                  >
                    <Link2 className="h-4 w-4" />
                    Generate Invite Link
                  </button>
                </div>

                {inviteLink ? (
                  <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        readOnly
                        value={inviteLink}
                        className="w-full rounded-md px-3 py-2 text-xs outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <button
                        onClick={() => void copyInviteLink()}
                        className="inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-semibold"
                        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                      Expires in {inviteCountdown}
                    </p>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          <section className="mt-6 rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-strong)' }}>
              Projects
            </h2>
            <div className="mt-4 space-y-2">
              {loading ? (
                <div className="h-20 rounded-lg animate-skeleton" />
              ) : projects.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  No projects registered yet.
                </p>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: project.color || 'var(--muted)' }}
                      />
                      <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                        {project.name}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Created {formatDate(project.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </AuthGuard>
  );
}
