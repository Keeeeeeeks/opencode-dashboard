'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type VerifyResponse = {
  valid: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          credentials: 'include',
        });
        const data = (await res.json()) as VerifyResponse;

        if (cancelled) {
          return;
        }

        if (data.valid) {
          router.replace('/');
          return;
        }

        setCheckingAuth(false);
      } catch {
        if (!cancelled) {
          setCheckingAuth(false);
        }
      }
    }

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{
          background: 'radial-gradient(circle at top, rgba(255, 92, 92, 0.12), transparent 55%), var(--bg)',
        }}
      >
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--muted)', borderTopColor: 'transparent' }}
        />
      </main>
    );
  }

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
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/branding/ocd-logo.svg" alt="OpenCode Dashboard logo" width={72} height={72} priority />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            OpenCode Dashboard
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Sign in to manage agent execution and delivery.
          </p>
        </div>

        <a
          href={`${API_BASE}/api/auth/login?redirect=${API_BASE}/`}
          className="flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-opacity"
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
      </section>
    </main>
  );
}
