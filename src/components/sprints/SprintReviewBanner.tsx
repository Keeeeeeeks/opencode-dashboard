'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { Sprint } from '@/lib/db/types';

interface SprintReviewBannerProps {
  sprint: Sprint;
}

function getDaysSinceEnd(endDate: number): number {
  const diffSeconds = Math.max(Math.floor(Date.now() / 1000) - endDate, 0);
  return Math.floor(diffSeconds / 86400);
}

export function SprintReviewBanner({ sprint }: SprintReviewBannerProps) {
  const daysSinceEnd = getDaysSinceEnd(sprint.end_date);
  const endedLabel =
    daysSinceEnd === 0 ? 'Ended today' : daysSinceEnd === 1 ? 'Ended 1 day ago' : `Ended ${daysSinceEnd} days ago`;

  return (
    <section
      className="border-b"
      style={{
        background: 'linear-gradient(90deg, rgba(251, 191, 36, 0.18), rgba(217, 119, 6, 0.22))',
        borderColor: 'rgba(217, 119, 6, 0.55)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'rgba(217, 119, 6, 0.22)', color: '#fef3c7' }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide" style={{ color: '#fef3c7' }}>
              Sprint review required
            </p>
            <p className="text-sm" style={{ color: '#fef3c7' }}>
              <span className="font-semibold">{sprint.name}</span> is waiting for review. {endedLabel}.
            </p>
          </div>
        </div>

        <Link
          href={`/analytics?sprint_id=${encodeURIComponent(sprint.id)}&review=true`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity"
          style={{
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid rgba(146, 64, 14, 0.35)',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.opacity = '0.86';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.opacity = '1';
          }}
        >
          Review Sprint
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
