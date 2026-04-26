import * as React from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  maxWidth = "md" 
}) => {
  const [render, setRender] = React.useState(isOpen);
  const [animate, setAnimate] = React.useState(isOpen);

  React.useEffect(() => {
    if (isOpen) {
      setRender(true);
      // Small delay to ensure render happens before fade-in class applies
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
      document.body.style.overflow = "hidden";
    } else {
      setAnimate(false);
      const timer = setTimeout(() => {
        setRender(false);
        document.body.style.overflow = "unset";
      }, 250); // match exit duration
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  if (!render) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-brand-ink/40 backdrop-blur-[8px] transition-opacity duration-base ease-out ${animate ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div 
        className={`
          relative w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] bg-brand-white rounded-xl shadow-modal border border-brand-border-strong flex flex-col
          transition-all duration-base ease-out
          ${animate ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border-strong shrink-0">
          <h2 className="font-display font-semibold text-lg text-brand-ink">{title}</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-brand-slate hover:bg-brand-fog hover:text-brand-ink transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 overflow-y-auto font-body text-brand-slate">
          {children}
        </div>
        
        {/* Sticky Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-brand-border-strong bg-brand-fog/50 flex items-center justify-end gap-3 shrink-0 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
