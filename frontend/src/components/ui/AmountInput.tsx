import * as React from "react";
import { Input } from "./Input";
import type { InputProps } from "./Input";

export interface AmountInputProps extends Omit<InputProps, 'prefixExt' | 'value' | 'onChange'> {
  value: number | '';
  onChange: (value: number | '') => void;
}

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, ...props }, ref) => {
    
    const formatIndianNumber = (num: number) => {
      if (typeof num !== 'number' || isNaN(num)) return '';
      return num.toLocaleString('en-IN');
    };

    const getLakhString = (num: number) => {
      if (num >= 100000 && num < 10000000) {
        const lakhs = num / 100000;
        return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}L`;
      }
      if (num >= 10000000) {
        const crores = num / 10000000;
        return `${Number.isInteger(crores) ? crores : crores.toFixed(2)}Cr`;
      }
      return '';
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
      if (rawValue === '') {
        onChange('');
      } else {
        onChange(parseInt(rawValue, 10));
      }
    };

    const displayValue = !value && value !== 0 ? '' : formatIndianNumber(value as number);
    const lakhString = value && typeof value === 'number' && value >= 100000 ? getLakhString(value) : '';

    return (
      <Input
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        prefixExt={<span className="font-semibold text-brand-slate">₹</span>}
        suffixExt={
          lakhString ? (
            <span className="text-[12px] font-medium bg-brand-forest-light text-brand-forest px-1.5 py-0.5 rounded">
              {lakhString}
            </span>
          ) : undefined
        }
        className="font-mono"
        inputMode="numeric"
        {...props}
      />
    );
  }
);
AmountInput.displayName = "AmountInput";
