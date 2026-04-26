import * as React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "tinted";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    
    let variantStyles = "";
    if (variant === "default") {
      variantStyles = "bg-brand-white shadow-card border-brand-border-strong";
    } else if (variant === "elevated") {
      variantStyles = "bg-brand-white shadow-float border-brand-border-strong";
    } else if (variant === "tinted") {
      variantStyles = "bg-brand-forest-light border-brand-forest/20";
    }

    return (
      <div
        ref={ref}
        className={`rounded-lg border overflow-hidden ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export const CardHeader = ({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 border-b border-brand-border-strong bg-brand-white/50 ${className}`} {...props}>
    {children}
  </div>
);

export const CardBody = ({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 border-t border-brand-border-strong bg-brand-fog/50 flex items-center justify-end gap-3 ${className}`} {...props}>
    {children}
  </div>
);
