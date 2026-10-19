import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: 'standard' | 'compact';
}

const TableDensityContext = React.createContext<'standard' | 'compact'>('standard');

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'standard', ...props }, ref) => (
    <TableDensityContext.Provider value={density}>
      <div className="relative w-full overflow-auto border border-[#0A0A0A] bg-[#FAF9F5] rounded-none">
        <table
          ref={ref}
          className={cn(
            'w-full caption-bottom text-left text-[13px] border-collapse',
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
  <thead
    ref={ref}
    className={cn('bg-[#EAE8E3] border-b-2 border-[#0A0A0A] [&_tr]:border-b-2 [&_tr]:border-[#0A0A0A]', className)}
    {...props}
  />
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
      'border-t-2 border-[#0A0A0A] bg-[#EAE8E3] font-semibold text-[#0A0A0A] [&>tr]:last:border-b-0',
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
      'border-b border-[#C8C5BC] transition-colors hover:bg-[#E4E2DC]/60 data-[state=selected]:bg-[#DDDAD2]',
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
        'font-mono text-xs font-semibold text-[#0A0A0A] uppercase tracking-wider text-left align-middle [&:has([role=checkbox])]:pr-0',
        density === 'compact' ? 'h-8 px-2.5 py-1' : 'h-10 px-4 py-2',
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
        'align-middle [&:has([role=checkbox])]:pr-0 text-[#0A0A0A]',
        density === 'compact' ? 'p-2 text-xs' : 'p-3.5 text-[13px]',
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
    className={cn('mt-4 font-mono text-xs text-[#4A4945]', className)}
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
