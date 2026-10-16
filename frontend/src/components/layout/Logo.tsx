import { Link } from 'react-router';

export function Logo({ to }: { to: string }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2 font-semibold text-slate-900">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span>MentorMeet</span>
    </Link>
  );
}
