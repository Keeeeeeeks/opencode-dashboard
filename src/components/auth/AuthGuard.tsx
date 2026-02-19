'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

type VerifyResponse = {
  valid: boolean;
  user?: {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: 'owner' | 'admin' | 'viewer';
  };
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          credentials: 'include',
        });
        const data = (await res.json()) as VerifyResponse;
        if (cancelled) {
          return;
        }

        if (data.valid && data.user) {
          setUser(data.user);
          return;
        }

        setUser(null);
        router.replace('/login');
      } catch {
        if (cancelled) {
          return;
        }
        setUser(null);
        router.replace('/login');
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [router, setLoading, setUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--muted)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
