import React from 'react';
import { Building2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/lib/session';
import { cn } from '@/lib/utils';

export interface ReportScopePromptProps {
  message?: string;
  description?: string;
  onSelectEntity?: (entity: 'ATA' | 'LTA') => void;
  className?: string;
  dataTestId?: string;
}

export const ReportScopePrompt: React.FC<ReportScopePromptProps> = ({
  message = 'Choose ATA or LTA to view this report',
  description = 'Single-Entity Scope Required: The selected report is scoped to a concrete operating entity. When viewing consolidated ALL, itemized records are unavailable. Please choose ATA or LTA to view this report.',
  onSelectEntity,
  className,
  dataTestId = 'entity-all-warning',
}) => {
  const setActiveEntity = useSessionStore((state) => state.setActiveEntity);

  const handleSelect = (ent: 'ATA' | 'LTA') => {
    if (onSelectEntity) {
      onSelectEntity(ent);
    } else {
      setActiveEntity(ent);
    }
  };

  return (
    <div
      data-testid={dataTestId}
      className={cn(
        'p-6 sm:p-8 bg-amber-50/70 border border-amber-200/90 rounded-xl text-center max-w-xl mx-auto my-8 shadow-2xs',
        className
      )}
    >
      <div className="w-11 h-11 rounded-full bg-amber-100 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-700 mb-3.5">
        <AlertTriangle className="w-5 h-5" />
      </div>

      <h3 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
        {message}
      </h3>

      <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
        {description}
      </p>

      <div className="flex items-center justify-center gap-3 mt-5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleSelect('ATA')}
          className="text-xs font-medium h-8 px-3.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-950 cursor-pointer shadow-2xs"
          data-testid="scope-prompt-btn-ata"
        >
          <Building2 className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
          Switch to ATA
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleSelect('LTA')}
          className="text-xs font-medium h-8 px-3.5 bg-white border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-950 cursor-pointer shadow-2xs"
          data-testid="scope-prompt-btn-lta"
        >
          <Building2 className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
          Switch to LTA
        </Button>
      </div>
    </div>
  );
};
