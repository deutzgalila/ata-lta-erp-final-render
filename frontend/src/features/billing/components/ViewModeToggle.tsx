import { LayoutGrid, Table as TableIcon, Columns } from 'lucide-react';

export type ViewMode = 'table' | 'kanban' | 'cards';

export interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  availableModes?: ViewMode[];
  className?: string;
  testIdPrefix?: string;
}

export function ViewModeToggle({
  mode,
  onChange,
  availableModes = ['table', 'kanban'],
  className = '',
  testIdPrefix = 'view-toggle',
}: ViewModeToggleProps) {
  return (
    <div
      className={`inline-flex items-center bg-[#EAE8E3] p-0 rounded-none border border-[#0A0A0A] divide-x divide-[#0A0A0A] ${className}`}
      data-testid="view-mode-toggle"
    >
      {availableModes.map((m) => {
        const isActive = mode === m;
        const icon =
          m === 'table' ? (
            <TableIcon className="h-3.5 w-3.5" />
          ) : m === 'kanban' ? (
            <Columns className="h-3.5 w-3.5" />
          ) : (
            <LayoutGrid className="h-3.5 w-3.5" />
          );
        const label = m === 'table' ? 'Table' : m === 'kanban' ? 'Kanban' : 'Cards';

        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-none transition-colors cursor-pointer ${
              isActive
                ? 'bg-[#0A0A0A] text-[#FAF9F5]'
                : 'bg-[#EAE8E3] text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A]'
            }`}
            data-testid={`${testIdPrefix}-${m}`}
            data-view-mode={m}
            title={`${label} view`}
          >
            {icon}
            <span className="capitalize">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
