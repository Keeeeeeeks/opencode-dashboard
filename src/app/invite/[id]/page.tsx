'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type InviteResponse = {
  invite?: {
    id: string;
    role: 'admin' | 'viewer';
    expires_at: number;
    used: boolean;
    expired: boolean;
  };
};

export default function InviteLandingPage() {
  const params = useParams<{ id: string }>();
  const inviteId = params.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchInvite() {
      try {
        const res = await fetch(`${API_BASE}/api/settings/invite/${inviteId}`);
        if (!res.ok) {
          if (!cancelled) {
            setError('This invite link has expired or already been used');
            setLoading(false);
          }
          return;
        }

        const data = (await res.json()) as InviteResponse;
        const invite = data.invite;

        if (!invite || invite.used || invite.expired) {
          if (!cancelled) {
            setError('This invite link has expired or already been used');
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setInviteRole(invite.role);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('This invite link has expired or already been used');
          setLoading(false);
        }
      }
    }

    if (inviteId) {
      void fetchInvite();
    }

    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  const authUrl = useMemo(
    () => `${API_BASE}/api/auth/login?redirect=${encodeURIComponent(`${API_BASE}/invite/${inviteId}/accept`)}`,
    [inviteId]
  );

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6"
      style={{
        background: 'radial-gradient(circle at top, rgba(255, 92, 92, 0.12), transparent 55%), var(--bg)',
      }}
    >
      <section
        className="w-full max-w-md rounded-2xl border p-8"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-strong)' }}>
          Team Invite
        </h1>

        {loading ? (
          <div className="mt-6 flex justify-center">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--muted)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : error ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
            {error}
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              You&apos;ve been invited to OpenCode Dashboard as {inviteRole}. Sign in with GitHub to continue.
            </p>

            <a
              href={authUrl}
              className="mt-6 flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-opacity"
              style={{
                background: 'var(--accent)',
                color: 'var(--text-strong)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = '1';
              }}
            >
              Sign in with GitHub
            </a>
          </>
        )}
      </section>
    </main>
  );
}
