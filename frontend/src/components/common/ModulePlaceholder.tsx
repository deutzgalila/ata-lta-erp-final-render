import { Layers, Construction } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isModuleEnabled } from '@/lib/flags';

interface ModulePlaceholderProps {
  name: string;
  description?: string;
}

export function ModulePlaceholder({ name, description }: ModulePlaceholderProps) {
  const enabled = isModuleEnabled(name);

  return (
    <div className="space-y-6" data-testid={`module-placeholder-${name.toLowerCase()}`}>
      <div className="border-b-2 border-[#0A0A0A] pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-widest text-[#4A4945] mb-1">
            MODULES // {name.toUpperCase()}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">{name}</h1>
            <Badge variant={enabled ? 'success' : 'secondary'} className="text-xs">
              {enabled ? 'Active Module' : 'Phase 2 Target'}
            </Badge>
          </div>
          <p className="text-xs text-[#4A4945] mt-1 font-mono">
            {description || `${name} management ledger and workflows for ATA & LTA ERP.`}
          </p>
        </div>
      </div>

      <Card className="border-dashed border-2 border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-none">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto my-3 flex h-14 w-14 items-center justify-center rounded-none bg-[#EAE8E3] text-[#0A0A0A] border border-[#0A0A0A]">
            {enabled ? <Layers className="h-7 w-7 text-[#0A0A0A]" /> : <Construction className="h-7 w-7 text-[#E61919]" />}
          </div>
          <CardTitle className="text-base font-bold uppercase tracking-tight text-[#0A0A0A]">
            {name} Compartment Frame
          </CardTitle>
          <CardDescription className="max-w-md mx-auto text-xs text-[#4A4945]">
            {enabled
              ? 'This module is enabled in feature flags and ready for Phase 2 implementation.'
              : 'This module is gated by Phase 1 enterprise architecture rules (R1, R5). Business workflows and CRUD operations will be integrated in Phase 2 after backend contract freeze.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-[#4A4945] pt-2 pb-6">
          <div className="inline-flex items-center gap-2 rounded-none bg-[#EAE8E3] px-4 py-2 border border-[#0A0A0A] font-mono text-xs">
            <span className="h-2 w-2 rounded-none bg-[#E61919] animate-pulse" />
            <span>FROZEN TOOLCHAIN: REACT 19 &bull; TS 5.7 &bull; VITE 6 &bull; QUERY 5</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
