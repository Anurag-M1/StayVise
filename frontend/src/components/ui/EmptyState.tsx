import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}) => {
  return (
    <div className="flex flex-col items-center text-center p-8 sm:p-12 border border-brand-border border-dashed rounded-xl bg-brand-white/50 w-full animate-in fade-in zoom-in-95 duration-base">
      
      {/* Abstract Shape Background with Icon inside */}
      <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
        {/* Irregular blob shape via border-radius */}
        <div className="absolute inset-0 bg-brand-forest-light rounded-[40%_60%_70%_30%_/_40%_50%_60%_50%] animate-[spin_10s_linear_infinite]" />
        <div className="absolute inset-0 bg-brand-border rounded-[60%_40%_30%_70%_/_60%_30%_70%_40%] animate-[spin_15s_linear_infinite_reverse]" />
        <Icon className="relative z-10 w-10 h-10 text-brand-forest" strokeWidth={1.5} />
      </div>

      <h3 className="font-display font-semibold text-xl text-brand-ink mb-2">{title}</h3>
      <p className="font-body text-brand-slate max-w-sm mb-6 leading-relaxed">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
