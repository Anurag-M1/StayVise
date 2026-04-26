import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ 
  title, 
  subtitle, 
  showBack = false, 
  backTo, 
  actions 
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex flex-col gap-1">
        {showBack && (
          <button 
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-slate hover:text-brand-forest transition-colors mb-2 w-fit group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back
          </button>
        )}
        <h1 className="font-display text-3xl font-bold text-brand-ink tracking-tight">{title}</h1>
        {subtitle && (
          <p className="font-body text-brand-slate text-[15px]">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {actions}
        </div>
      )}
    </div>
  );
};
