import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-none font-mono text-xs font-semibold uppercase tracking-wider transition-colors border select-none focus:outline-none focus:ring-2 focus:ring-[#E61919] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A]',
        secondary: 'bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A]',
        destructive: 'bg-[#FCE8E8] text-[#A81212] border-[#E61919]',
        success: 'bg-[#E6F2E8] text-[#0F5223] border-[#1B7A37]',
        warning: 'bg-[#FDF3D7] text-[#734800] border-[#B87500]',
        info: 'bg-[#E8EEF5] text-[#103F6E] border-[#1E5C99]',
        outline: 'bg-[#FAF9F5] text-[#0A0A0A] border-[#0A0A0A]',
        ata: 'bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A]',
        lta: 'bg-[#3A3935] text-[#FAF9F5] border-[#0A0A0A]',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        compact: 'px-1.5 py-0 text-xs leading-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  density?: 'standard' | 'compact';
}

function Badge({ className, variant, size, density, ...props }: BadgeProps) {
  const effectiveSize = density === 'compact' && (!size || size === 'default') ? 'compact' : size;
  return (
    <div className={cn(badgeVariants({ variant, size: effectiveSize }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
