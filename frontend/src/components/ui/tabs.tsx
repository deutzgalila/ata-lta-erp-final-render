import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    density?: 'standard' | 'compact';
  }
>(({ className, density = 'standard', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center justify-start rounded-none bg-[#EAE8E3] p-0 text-[#4A4945] border border-[#0A0A0A] border-b-2 overflow-x-auto max-w-full w-full gap-0 h-auto',
      density === 'compact' ? 'min-h-[34px]' : 'min-h-[40px]',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    density?: 'standard' | 'compact';
  }
>(({ className, density = 'standard', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-none border-r border-[#C8C5BC] font-mono text-xs font-semibold tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E61919] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:shadow-[inset_0_-3px_0_0_#E61919] transition-colors cursor-pointer shrink-0 select-none',
      density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-[#F4F4F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E61919]',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
