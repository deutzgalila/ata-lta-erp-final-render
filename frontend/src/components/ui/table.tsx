import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: 'standard' | 'compact';
}

const TableDensityContext = React.createContext<'standard' | 'compact'>('standard');

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'standard', ...props }, ref) => (
    <TableDensityContext.Provider value={density}>
      <div className="relative w-full overflow-auto">
        <table
          ref={ref}
          className={cn(
            'w-full caption-bottom text-left text-sm',
            density === 'compact' && 'text-xs',
            className
          )}
          {...props}
        />
      </div>
    </TableDensityContext.Provider>
  )
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b border-[#f0f0f5]', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-[#f0f0f5] bg-[#f8fafc] font-medium [&>tr]:last:border-b-0',
      className
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-[#f0f0f5] transition-colors hover:bg-[#f8fafc]/80 data-[state=selected]:bg-[#f0f1f3]',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { density?: 'standard' | 'compact' }
>(({ className, density: propDensity, ...props }, ref) => {
  const contextDensity = React.useContext(TableDensityContext);
  const density = propDensity || contextDensity;

  return (
    <th
      ref={ref}
      className={cn(
        'font-semibold text-[#9494a0] uppercase tracking-wider text-left align-middle [&:has([role=checkbox])]:pr-0',
        density === 'compact' ? 'h-8 px-2.5 py-1 text-[11px]' : 'h-10 px-4 py-2 text-xs',
        className
      )}
      {...props}
    />
  );
});
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { density?: 'standard' | 'compact' }
>(({ className, density: propDensity, ...props }, ref) => {
  const contextDensity = React.useContext(TableDensityContext);
  const density = propDensity || contextDensity;

  return (
    <td
      ref={ref}
      className={cn(
        'align-middle [&:has([role=checkbox])]:pr-0 text-[#1e293b]',
        density === 'compact' ? 'p-2 text-xs' : 'p-3.5 text-sm',
        className
      )}
      {...props}
    />
  );
});
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-xs text-[#9494a0]', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
