import { Link } from 'react-router';
import { EmptyState } from '../components/common/EmptyState';

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <Link to="/book" className="font-medium text-brand-700 hover:text-brand-800">
            Go to the booking page
          </Link>
        }
      />
    </div>
  );
}
