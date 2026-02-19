'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type VerifyResponse = {
  valid: boolean;
};

export default function InviteAcceptPage() {
  const params = useParams<{ id: string }>();
  const inviteId = params.id;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function acceptInvite() {
      try {
        const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
          credentials: 'include',
        });
        const verifyData = (await verifyRes.json()) as VerifyResponse;

        if (cancelled) {
          return;
        }

        if (!verifyData.valid) {
          setError('You must be signed in to accept this invite.');
          return;
        }

        const acceptRes = await fetch(`${API_BASE}/api/settings/invite/${inviteId}/accept`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!acceptRes.ok) {
          const payload = (await acceptRes.json().catch(() => ({ error: 'Failed to accept invite' }))) as {
            error?: string;
          };
          setError(payload.error || 'Failed to accept invite');
          return;
        }

        router.replace('/');
      } catch {
        if (!cancelled) {
          setError('Failed to accept invite');
        }
      }
    }

    if (inviteId) {
      void acceptInvite();
    }

    return () => {
      cancelled = true;
    };
  }, [inviteId, router]);

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
          Accepting Invite
        </h1>
        {error ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--muted)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Finishing sign-in and activating your team access...
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
