import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]',
        secondary: 'bg-[#f0f1f3] text-[#1e293b] hover:bg-[#e4e5e9]',
        destructive: 'bg-[#ef4444] text-white hover:bg-[#dc2626]',
        outline: 'border border-[#f0f0f5] text-[#1e293b]',
        success: 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/25',
        warning: 'bg-[#fbbf24]/20 text-[#b45309] border border-[#fbbf24]/30',
        info: 'bg-[#3b82f6]/15 text-[#2563eb] border border-[#3b82f6]/25',
        ata: 'bg-[#2563eb]/15 text-[#2563eb] border border-[#2563eb]/30',
        lta: 'bg-[#475569]/15 text-[#475569] border border-[#475569]/30',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        compact: 'px-1.5 py-0 text-[10px] leading-tight',
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
