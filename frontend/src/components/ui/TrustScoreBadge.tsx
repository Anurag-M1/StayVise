import * as React from "react";
import { countUp } from "../../lib/animations";

export interface TrustScoreBadgeProps {
  score: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  label?: string;
  animate?: boolean;
}

export const TrustScoreBadge: React.FC<TrustScoreBadgeProps> = ({ 
  score, 
  size = "md", 
  label,
  animate = true
}) => {
  const [displayScore, setDisplayScore] = React.useState(animate ? 0 : score);

  React.useEffect(() => {
    if (animate) {
      countUp(0, score, 1000, setDisplayScore);
    } else {
      setDisplayScore(score);
    }
  }, [score, animate]);

  const sizes = {
    xs: { outer: 32, stroke: 2, text: "text-xs", labelText: "text-[10px]" },
    sm: { outer: 48, stroke: 3, text: "text-sm", labelText: "text-xs" },
    md: { outer: 72, stroke: 5, text: "text-2xl", labelText: "text-xs" },
    lg: { outer: 120, stroke: 8, text: "text-4xl", labelText: "text-sm" },
    xl: { outer: 180, stroke: 12, text: "text-6xl", labelText: "text-base" },
  };

  const currentSize = sizes[size];
  const radius = (currentSize.outer - currentSize.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  let colorClass = "text-brand-danger";
  if (score >= 85) colorClass = "text-brand-gold";
  else if (score >= 70) colorClass = "text-brand-forest";
  else if (score >= 50) colorClass = "text-brand-amber";

  return (
    <div className="inline-flex flex-col items-center">
      <div 
        className="relative flex items-center justify-center rounded-full"
        style={{ width: currentSize.outer, height: currentSize.outer }}
      >
        <svg 
          className="absolute inset-0 transform -rotate-90 w-full h-full"
          role="img"
          aria-label={`Trust score: ${score}%`}
        >
          <circle
            cx={currentSize.outer / 2}
            cy={currentSize.outer / 2}
            r={radius}
            strokeWidth={currentSize.stroke}
            className="stroke-current text-brand-border"
            fill="transparent"
          />
          <circle
            cx={currentSize.outer / 2}
            cy={currentSize.outer / 2}
            r={radius}
            strokeWidth={currentSize.stroke}
            className={`stroke-current ${colorClass} transition-all ease-[cubic-bezier(0.16,1,0.3,1)] duration-1000`}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <span className={`font-display font-bold text-brand-ink ${currentSize.text}`}>
          {displayScore}
        </span>
      </div>
      {label && (
        <span className={`mt-2 font-body font-medium text-brand-slate ${currentSize.labelText}`}>
          {label}
        </span>
      )}
    </div>
  );
};
