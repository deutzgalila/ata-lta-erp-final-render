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
      className={`flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 ${className}`}
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
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
              isActive
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
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
