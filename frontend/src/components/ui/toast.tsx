import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-[#1e293b] group-[.toaster]:border-[#f0f0f5] group-[.toaster]:shadow-[0_10px_40px_rgba(0,0,0,0.08)] group-[.toaster]:rounded-xl font-sans',
          description: 'group-[.toast]:text-[#9494a0]',
          actionButton:
            'group-[.toast]:bg-[#2563eb] group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-[#f0f1f3] group-[.toast]:text-[#1e293b]',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
