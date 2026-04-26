import * as React from "react";

export type ProjectStatusType = "draft" | "awaiting_payment" | "in_progress" | "submitted" | "approved" | "completed" | "disputed" | "cancelled";

export interface StatusBadgeProps {
  status: ProjectStatusType | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({ status, className = "" }) => {
  const normalizedStatus = status.toLowerCase() as ProjectStatusType;
  
  const map: Record<ProjectStatusType | string, { label: string, classes: string, dot: string }> = {
    draft: { label: 'Draft', classes: 'bg-brand-fog text-brand-slate border-brand-border', dot: 'bg-brand-mist' },
    awaiting_payment: { label: 'Awaiting Payment', classes: 'bg-brand-amber/10 text-brand-amber border-[#EF9F27]/20', dot: 'bg-brand-amber' },
    in_progress: { label: 'In Progress', classes: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    submitted: { label: 'Submitted', classes: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
    approved: { label: 'Approved', classes: 'bg-brand-forest-light text-brand-forest border-brand-border', dot: 'bg-brand-forest' },
    completed: { label: 'Completed', classes: 'bg-brand-forest text-brand-white border-brand-forest-dark', dot: 'bg-brand-white' },
    disputed: { label: 'Disputed', classes: 'bg-brand-danger-light text-brand-danger border-brand-danger/20', dot: 'bg-brand-danger' },
    cancelled: { label: 'Cancelled', classes: 'bg-brand-fog text-brand-mist border-brand-border', dot: 'bg-brand-mist' },
  };

  const conf = map[normalizedStatus] || map.draft;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-body font-semibold border ${conf.classes} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`}></span>
      {conf.label}
    </span>
  );
});
