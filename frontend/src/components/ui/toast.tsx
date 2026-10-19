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
            'group toast group-[.toaster]:bg-[#FAF9F5] group-[.toaster]:text-[#0A0A0A] group-[.toaster]:border group-[.toaster]:border-[#0A0A0A] group-[.toaster]:shadow-[4px_4px_0px_#0A0A0A] group-[.toaster]:rounded-none font-sans',
          description: 'group-[.toast]:text-[#4A4945]',
          actionButton:
            'group-[.toast]:bg-[#0A0A0A] group-[.toast]:text-[#FAF9F5] group-[.toast]:rounded-none group-[.toast]:border group-[.toast]:border-[#0A0A0A]',
          cancelButton:
            'group-[.toast]:bg-[#EAE8E3] group-[.toast]:text-[#0A0A0A] group-[.toast]:rounded-none group-[.toast]:border group-[.toast]:border-[#0A0A0A]',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
