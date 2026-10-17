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
          'flex w-full rounded-md border border-[#f0f0f5] bg-white text-[#1e293b] shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#9494a0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50',
          density === 'compact' ? 'h-7 px-2.5 py-0.5 text-xs' : 'h-9 px-3 py-1 text-sm',
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
