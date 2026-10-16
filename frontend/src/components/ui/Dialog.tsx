import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Accessible modal dialog: role="dialog", labelled by its title, closes on
 * Escape or backdrop click (unless `busy`), and moves focus inside on open.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  /** While a request is pending the dialog cannot be dismissed. */
  busy?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // An explicit [data-autofocus] target wins (e.g. "Cancel" in destructive
    // confirmations); otherwise the first form control.
    const firstFocusable =
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-dialog-close])',
      );
    (firstFocusable ?? panelRef.current)?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/40"
        aria-hidden="true"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
