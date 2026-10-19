import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E61919] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default: 'border border-[#0A0A0A] bg-[#0A0A0A] text-[#FAF9F5] shadow-none hover:bg-[#222220]',
        destructive: 'border border-[#0A0A0A] bg-[#E61919] text-[#FAF9F5] shadow-none hover:bg-[#C41212]',
        outline: 'border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] shadow-none hover:bg-[#E4E2DC] hover:text-[#0A0A0A]',
        secondary: 'border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A] shadow-none hover:bg-[#E4E2DC]',
        ghost: 'text-[#0A0A0A] hover:bg-[#E4E2DC] hover:text-[#0A0A0A]',
        link: 'text-[#0A0A0A] underline-offset-4 hover:underline p-0 h-auto font-normal',
        ata: 'border border-[#0A0A0A] bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#222220]',
        lta: 'border border-[#0A0A0A] bg-[#3A3935] text-[#FAF9F5] hover:bg-[#222220]',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm',
        sm: 'h-8 px-3 text-xs',
        xs: 'h-7 px-2.5 text-xs',
        lg: 'h-10 px-6 text-base font-semibold',
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
