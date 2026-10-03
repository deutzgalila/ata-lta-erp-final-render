import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#2563eb] text-white shadow-sm hover:bg-[#1d4ed8]',
        destructive: 'bg-[#ef4444] text-white shadow-sm hover:bg-[#dc2626]',
        outline: 'border border-[#f0f0f5] bg-white text-[#1e293b] shadow-xs hover:bg-[#f0f1f3] hover:text-[#1e293b]',
        secondary: 'bg-[#f0f1f3] text-[#1e293b] hover:bg-[#e4e5e9]',
        ghost: 'text-[#1e293b] hover:bg-[#f0f1f3]',
        link: 'text-[#2563eb] underline-offset-4 hover:underline p-0 h-auto font-normal',
        ata: 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]',
        lta: 'bg-[#475569] text-white hover:bg-[#334155]',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm',
        sm: 'h-8 rounded-md px-3 text-xs',
        xs: 'h-7 rounded-md px-2.5 text-[11px]',
        lg: 'h-10 rounded-md px-6 text-base',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-xs': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  density?: 'standard' | 'compact';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, density, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const effectiveSize = density === 'compact' && (!size || size === 'default') ? 'sm' : size;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size: effectiveSize, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
