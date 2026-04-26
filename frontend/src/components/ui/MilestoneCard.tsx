import * as React from "react";
import { StatusBadge } from "./StatusBadge";
import { fmtINR } from '../../lib/currency';
import type { ProjectStatusType } from "./StatusBadge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./Button";

export interface MilestoneCardProps {
  title: string;
  amount: number;
  status: ProjectStatusType | string;
  description?: string;
  dateStr?: string;
  isLast?: boolean;
  onAction?: () => void;
  actionLabel?: string;
}

export const MilestoneCard: React.FC<MilestoneCardProps> = ({
  title,
  amount,
  status,
  description,
  dateStr,
  isLast = false,
  onAction,
  actionLabel
}) => {
  const [expanded, setExpanded] = React.useState(false);
  
  const isCompleted = status === "completed" || status === "approved" || status === "released";
  const lineClass = isCompleted ? "bg-brand-forest" : "bg-brand-border-strong";
  const circleClass = isCompleted ? "bg-brand-forest border-brand-forest shadow-[0_0_0_4px_rgba(15,110,86,0.1)]" : "bg-brand-white border-brand-mist";

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className={`absolute left-[11px] top-6 bottom-[-24px] w-[2px] ${lineClass} transition-colors duration-500`} />
      )}
      
      {/* Timeline dot */}
      <div className="relative mt-1.5 flex-shrink-0">
        <div className={`w-6 h-6 rounded-full border-2 z-10 relative flex items-center justify-center transition-all ${circleClass}`}>
          {isCompleted && (
            <svg className="w-3 h-3 text-brand-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex-1 pb-6">
        <div 
          className={`bg-brand-white rounded-lg border border-brand-border-strong shadow-card overflow-hidden transition-all duration-base ${description ? 'cursor-pointer hover:border-brand-forest/50' : ''}`}
          onClick={() => description && setExpanded(!expanded)}
        >
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-display font-semibold text-brand-ink text-lg">{title}</h4>
              {dateStr && <p className="text-sm font-body text-brand-slate mt-0.5">{dateStr}</p>}
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
              <div className="text-right">
                <div className="font-mono text-lg font-bold text-brand-ink">₹{fmtINR(amount)}</div>
                <StatusBadge status={status} className="mt-1" />
              </div>
              {description && (
                <button className="text-brand-slate hover:text-brand-ink p-1">
                  {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              )}
            </div>
          </div>
          
          {description && expanded && (
            <div className="px-5 pb-5 pt-1 border-t border-brand-border-strong bg-brand-fog/30 flex flex-col gap-4 animate-in slide-in-from-top-2 fade-in duration-200">
              <p className="text-sm font-body text-brand-slate leading-relaxed">{description}</p>
              {onAction && actionLabel && (
                <div className="self-end">
                  <Button size="sm" onClick={(e) => { e.stopPropagation(); onAction(); }}>{actionLabel}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
