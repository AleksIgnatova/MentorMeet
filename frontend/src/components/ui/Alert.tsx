import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'error' | 'success' | 'info' | 'warning';

const tones: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

/** Errors and warnings are announced immediately (role="alert"); others politely. */
export function Alert({
  tone = 'info',
  children,
  onDismiss,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const urgent = tone === 'error' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', tones[tone], className)}
    >
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
