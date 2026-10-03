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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">{name}</h1>
            <Badge variant={enabled ? 'success' : 'secondary'} className="text-xs">
              {enabled ? 'Active Module' : 'Phase 2 Migration Target'}
            </Badge>
          </div>
          <p className="text-sm text-[#9494a0] mt-1">
            {description || `${name} management and workflows for ATA & LTA ERP.`}
          </p>
        </div>
      </div>

      <Card className="border-dashed border-2 border-[#f0f0f5] bg-white/70">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto my-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb]">
            {enabled ? <Layers className="h-7 w-7" /> : <Construction className="h-7 w-7 text-amber-500" />}
          </div>
          <CardTitle className="text-lg font-semibold text-[#1e293b]">
            {name} Module Shell
          </CardTitle>
          <CardDescription className="max-w-md mx-auto text-xs text-[#9494a0]">
            {enabled
              ? 'This module is enabled in feature flags and ready for Phase 2 implementation.'
              : 'This module is gated by Phase 1 enterprise architecture rules (R1, R5). Business workflows and CRUD operations will be integrated in Phase 2 after backend contract freeze.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-xs text-[#9494a0] pt-2 pb-6">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[#f8fafc] px-4 py-2 border border-[#f0f0f5]">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Frozen Toolchain: React 19 + TypeScript + Vite 6 + TanStack Query 5</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
