'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  show: boolean;
  message: string;
}

export function Toast({ show, message }: ToastProps) {
  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-[80] pointer-events-none transition-all duration-300',
        show ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      )}
    >
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--ok)' }} />
        <span>{message}</span>
      </div>
    </div>
  );
}
