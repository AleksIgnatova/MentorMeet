import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';

/** Host area layout (dashboard). */
export function AppLayout() {
  return (
    <div className="min-h-dvh bg-slate-50">
      <Sidebar />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
