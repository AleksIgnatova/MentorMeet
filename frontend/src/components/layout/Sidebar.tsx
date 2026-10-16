import { NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { Logo } from './Logo';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/book', label: 'Public booking page' },
];

/** Vertical navigation on large screens, a compact top bar on small ones. */
export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:w-60 lg:border-r lg:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:flex-col lg:flex-nowrap lg:items-stretch lg:px-5 lg:py-6">
        <Logo to="/dashboard" />
        <nav aria-label="Main" className="flex gap-1 lg:mt-8 lg:flex-col">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
