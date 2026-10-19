import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div
      data-testid="not-found-screen"
      className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center border-2 border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-[4px_4px_0px_#0A0A0A]"
    >
      <div className="rounded-none bg-[#E8EEF5] p-4 text-[#103F6E] mb-4 border border-[#1E5C99]">
        <FileQuestion className="h-10 w-10 text-[#103F6E]" />
      </div>
      <h1 className="text-4xl font-black uppercase tracking-tight text-[#0A0A0A] mb-1 font-display">
        404
      </h1>
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#4A4945] mb-2">
        RECORD NOT LOCATED // ROUTE UNRECOGNIZED
      </h2>
      <p className="text-sm text-[#4A4945] max-w-md mb-6">
        The requested routing coordinates do not resolve to an active system partition.
      </p>
      <Button asChild className="gap-2 font-mono text-xs uppercase font-bold">
        <Link to="/">
          <Home className="h-4 w-4" />
          Return to Dashboard
        </Link>
      </Button>
    </div>
  );
}
