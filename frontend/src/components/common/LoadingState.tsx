import { Spinner } from '../ui/Spinner';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Spinner className="size-5 text-brand-600" />
      <span>{label}</span>
    </div>
  );
}
