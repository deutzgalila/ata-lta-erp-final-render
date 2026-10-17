import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface ForbiddenProps {
  requiredPermission?: string;
}

export function Forbidden({ requiredPermission }: ForbiddenProps) {
  return (
    <div
      data-testid="forbidden-screen"
      className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="rounded-full bg-amber-100 p-4 text-amber-600 mb-4 shadow-xs">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold text-[#1e293b] mb-2">Access Forbidden</h1>
      <p className="text-sm text-[#9494a0] max-w-md mb-2">
        You do not have the required permissions to view this resource.
      </p>
      {requiredPermission && (
        <div className="my-2 rounded-md bg-[#f0f1f3] px-3 py-1 text-xs font-mono text-[#1e293b]">
          Required: <span className="font-semibold text-[#2563eb]">{requiredPermission}</span>
        </div>
      )}
      <div className="mt-6">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
