import * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-none bg-[#EAE8E3]', className)}
      {...props}
    />
  );
}

export { Skeleton };
