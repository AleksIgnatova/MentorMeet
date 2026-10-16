import { Outlet } from 'react-router';
import { Logo } from './Logo';

/** Visitor-facing layout (booking and confirmation pages). */
export function PublicLayout() {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3 sm:px-6">
          <Logo to="/book" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
