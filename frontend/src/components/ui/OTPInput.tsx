import React, { useRef, useState, useEffect } from "react";

export interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export const OTPInput: React.FC<OTPInputProps> = ({ length = 6, value, onChange, error }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  
  // ensure array of length
  const valueArr = value.split('').concat(Array(length).fill('')).slice(0, length);

  const focusInput = (index: number) => {
    if (index >= 0 && index < length) {
      inputs.current[index]?.focus();
    }
  };

  useEffect(() => {
    // Auto-focus the first input on mount
    focusInput(0);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.replace(/\D/g, ''); // Numbers only
    if (!val) return;
    
    // Support auto-fill or pasting multiple digits instantly
    if (val.length > 1) {
      onChange(val.slice(0, length));
      focusInput(Math.min(val.length, length - 1));
      return;
    }

    // Use only the last typed character in case they type multiple quickly
    const char = val.slice(-1);
    const newArr = [...valueArr];
    newArr[index] = char;
    
    onChange(newArr.join(''));
    if (index < length - 1) focusInput(index + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const newArr = [...valueArr];
      if (newArr[index]) {
        // Current cell has value, clear it
        newArr[index] = "";
      } else {
        // Current cell empty, clear previous and focus previous
        if (index > 0) {
          newArr[index - 1] = "";
          focusInput(index - 1);
        }
      }
      onChange(newArr.join(''));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text/plain").replace(/\D/g, "").slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      focusInput(Math.min(pastedData.length, length - 1));
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-2 sm:gap-3" onPaste={handlePaste}>
        {valueArr.map((char, index) => (
          <input
            key={index}
            ref={(el) => (inputs.current[index] = el)}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={char}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`
              w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl font-medium border rounded-md transition-colors
              ${error ? 'border-brand-danger focus:border-brand-danger bg-brand-danger-light/30' : 'border-brand-border-strong focus:border-brand-forest focus:ring-1 focus:ring-brand-forest bg-brand-white'}
              outline-none
            `}
          />
        ))}
      </div>
      {error && (
        <span className="mt-2 text-[13px] text-brand-danger font-body font-medium animate-in fade-in slide-in-from-top-1">
          {error}
        </span>
      )}
    </div>
  );
};
