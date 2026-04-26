import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  prefixExt?: React.ReactNode;
  suffixExt?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, prefixExt, suffixExt, placeholder, ...props }, ref) => {
    const id = React.useId();
    const [focused, setFocused] = React.useState(false);

    // Determines if the label should be "floated" (shrunk & moved up)
    const isFloated = focused || (props.value !== undefined && props.value !== '') || (props.defaultValue !== undefined && props.defaultValue !== '');

    return (
      <div className={`relative flex flex-col ${className}`}>
        <div className="relative flex items-center">
          {prefixExt && (
            <div className="absolute left-3 flex items-center justify-center text-brand-slate z-10 w-5">
              {prefixExt}
            </div>
          )}
          
          <div className="relative flex-1">
            <input
              id={id}
              ref={ref}
              placeholder={focused ? placeholder : ""}
              onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
              onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
              className={`
                w-full h-[48px] px-3 font-body text-[15px] text-brand-ink bg-brand-white border rounded-md transition-colors duration-fast outline-none
                ${prefixExt ? 'pl-10' : 'pl-3'}
                ${suffixExt ? 'pr-10' : 'pr-3'}
                ${error ? 'border-brand-danger focus:border-brand-danger' : 'border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest'}
                ${props.disabled ? 'opacity-50 cursor-not-allowed bg-brand-fog' : ''}
              `}
              {...props}
            />
            <label
              htmlFor={id}
              className={`
                absolute left-3 transition-all duration-fast pointer-events-none font-body
                ${prefixExt && !isFloated ? 'left-10' : 'left-3'}
                ${isFloated 
                  ? '-top-2.5 bg-brand-white px-1 text-[12px] font-medium text-brand-forest z-10' 
                  : 'top-[13px] text-[15px] text-brand-mist'
                }
                ${error && isFloated ? 'text-brand-danger' : ''}
              `}
            >
              {label}
            </label>
          </div>

          {suffixExt && (
            <div className="absolute right-3 flex items-center justify-center text-brand-slate z-10">
              {suffixExt}
            </div>
          )}
        </div>
        
        {error && (
          <span className="mt-1.5 text-[13px] text-brand-danger font-body font-medium flex items-center gap-1">
             <span className="inline-block w-1.5 h-1.5 bg-brand-danger rounded-full"></span>
             {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
