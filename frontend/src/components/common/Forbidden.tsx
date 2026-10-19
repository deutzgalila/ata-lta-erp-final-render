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
      className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center border-2 border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-[4px_4px_0px_#0A0A0A]"
    >
      <div className="rounded-none bg-[#FDF3D7] p-4 text-[#734800] mb-4 border border-[#B87500]">
        <ShieldAlert className="h-10 w-10 text-[#734800]" />
      </div>
      <div className="mb-2 inline-block border border-[#0A0A0A] bg-[#EAE8E3] px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
        ERR // 403 UNAUTHORIZED
      </div>
      <h1 className="text-2xl font-black uppercase tracking-tight text-[#0A0A0A] mb-2 font-display">
        Access Forbidden
      </h1>
      <p className="text-sm text-[#4A4945] max-w-md mb-2">
        You do not possess the necessary operational permissions to access this ledger division.
      </p>
      {requiredPermission && (
        <div className="my-2 rounded-none bg-[#EAE8E3] border border-[#0A0A0A] px-3 py-1 text-xs font-mono text-[#0A0A0A]">
          REQUIRED PERMISSION: <span className="font-bold text-[#E61919]">{requiredPermission}</span>
        </div>
      )}
      <div className="mt-6">
        <Button asChild variant="outline" className="gap-2 font-mono text-xs uppercase font-bold">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Return to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
