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
        'p-6 sm:p-8 bg-[#FAF9F5] border-2 border-[#0A0A0A] rounded-none text-center max-w-xl mx-auto my-8 shadow-none',
        className
      )}
    >
      <div className="w-10 h-10 rounded-none bg-[#FDF3D7] border border-[#B87500] flex items-center justify-center mx-auto text-[#734800] mb-3.5">
        <AlertTriangle className="w-5 h-5" />
      </div>

      <h3 className="text-base sm:text-lg font-bold uppercase tracking-tight text-[#0A0A0A]">
        {message}
      </h3>

      <p className="text-xs sm:text-sm text-[#4A4945] mt-2 max-w-md mx-auto leading-relaxed">
        {description}
      </p>

      <div className="flex items-center justify-center gap-3 mt-5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleSelect('ATA')}
          className="text-xs font-mono font-semibold h-8 px-3.5 bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] rounded-none cursor-pointer shadow-none transition-colors"
          data-testid="scope-prompt-btn-ata"
        >
          <Building2 className="w-3.5 h-3.5 mr-1.5" />
          Switch to ATA
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleSelect('LTA')}
          className="text-xs font-mono font-semibold h-8 px-3.5 bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FAF9F5] rounded-none cursor-pointer shadow-none transition-colors"
          data-testid="scope-prompt-btn-lta"
        >
          <Building2 className="w-3.5 h-3.5 mr-1.5" />
          Switch to LTA
        </Button>
      </div>
    </div>
  );
};
