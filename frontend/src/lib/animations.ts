export const animations = {
  fadeInUp: "animate-in fade-in slide-in-from-bottom-3 duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
  staggerChildren: () => `animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both`,
}

// Easing variables derived from tokens.css for JS usage where needed
export const easings = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
};

// Durations
export const durations = {
  fast: 150,
  base: 250,
  slow: 400,
};

/**
 * Animate a counter component using an easing function
 */
export const countUp = (
  start: number,
  end: number,
  durationMs: number = 1000,
  onUpdate: (val: number) => void
) => {
  let startTimestamp: number | null = null;
  const step = (timestamp: number) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / durationMs, 1);
    
    // ease-out cubic
    const easeOutProgress = 1 - Math.pow(1 - progress, 3);
    
    onUpdate(Math.floor(easeOutProgress * (end - start) + start));
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      onUpdate(end); // Ensure we hit exact target at the end
    }
  };
  window.requestAnimationFrame(step);
};
