import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div
      data-testid="not-found-screen"
      className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="rounded-full bg-blue-100 p-4 text-[#2563eb] mb-4 shadow-xs">
        <FileQuestion className="h-10 w-10" />
      </div>
      <h1 className="text-3xl font-bold text-[#1e293b] mb-2">404</h1>
      <h2 className="text-lg font-medium text-[#1e293b] mb-2">Page Not Found</h2>
      <p className="text-sm text-[#9494a0] max-w-md mb-6">
        The route you are trying to access does not exist or may have been moved.
      </p>
      <Button asChild className="gap-2">
        <Link to="/">
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
