import * as React from "react";
import toast, { ToastBar, Toaster } from "react-hot-toast";

/**
 * ToastProvider should be wrapping the app in App.tsx.
 * It overrides react-hot-toast defaults with our brand system.
 */
export const ToastProvider = () => {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        className: "!bg-brand-white !text-brand-ink !font-body !text-sm !shadow-float !border !border-brand-border-strong !rounded-lg",
        success: {
          iconTheme: {
            primary: "var(--brand-forest)",
            secondary: "var(--brand-white)",
          },
        },
        error: {
          iconTheme: {
            primary: "var(--brand-danger)",
            secondary: "var(--brand-white)",
          },
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t} style={{
          ...t.style,
          animation: t.visible ? 'animate-in slide-in-from-right-8 fade-in duration-300' : 'animate-out slide-out-to-right-8 fade-out duration-200'
        }} />
      )}
    </Toaster>
  );
};

// Also export the toaster instance configured if needed.
// We generally use toast.success() or toast.error() imported from react-hot-toast.
export { toast };

export const useToast = () => {
    return {
        toast: {
            title: (t: string, options?: any) => toast(t, options),
            success: (t: string) => toast.success(t),
            error: (t: string) => toast.error(t),
            loading: (t: string) => toast.loading(t),
            dismiss: (t?: string) => toast.dismiss(t),
        }
    };
};
