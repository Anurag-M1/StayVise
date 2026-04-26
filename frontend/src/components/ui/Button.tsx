import * as React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-body font-medium tracking-[-0.01em] transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2";
    
    const variants = {
      primary: "bg-brand-forest text-brand-white hover:bg-brand-forest-dark hover:-translate-y-[1px] hover:shadow-float active:translate-y-0 active:shadow-none border border-transparent",
      secondary: "bg-brand-white text-brand-forest border border-brand-border-strong hover:bg-brand-forest-light",
      outline: "bg-transparent text-brand-ink border border-brand-border-strong hover:bg-brand-fog",
      ghost: "bg-transparent text-brand-forest hover:bg-brand-forest-light",
      danger: "bg-brand-danger text-brand-white hover:bg-[#C04820] hover:-translate-y-[1px] hover:shadow-float",
      link: "bg-transparent text-brand-forest underline underline-offset-4 hover:text-brand-forest-dark px-0",
    };

    const sizes = {
      sm: "h-[32px] px-3 text-sm rounded-sm",
      md: "h-[40px] px-4 text-[15px] rounded-md",
      lg: "h-[48px] px-6 text-[15px] rounded-lg",
    };

    const combinedClasses = `
      ${baseStyles} 
      ${variant === "link" ? variants.link : `${variants[variant]} ${sizes[size]}`}
      ${disabled || isLoading ? "opacity-50 pointer-events-none" : ""}
      ${className}
    `.replace(/\s+/g, ' ').trim();

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={combinedClasses}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
