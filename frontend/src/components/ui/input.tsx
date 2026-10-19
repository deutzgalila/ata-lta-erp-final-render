import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  density?: 'standard' | 'compact';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, density = 'standard', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-none border border-[#111111] bg-[#FFFFFF] text-[#0A0A0A] shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#5C5B57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E61919] disabled:cursor-not-allowed disabled:opacity-50',
          density === 'compact' ? 'h-8 px-2.5 py-1 text-xs' : 'h-9 px-3 py-1.5 text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
