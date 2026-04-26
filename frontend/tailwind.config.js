/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          forest: 'var(--brand-forest)',
          'forest-dark': 'var(--brand-forest-dark)',
          'forest-light': 'var(--brand-forest-light)',
          gold: 'var(--brand-gold)',
          amber: 'var(--brand-amber)',
          danger: 'var(--brand-danger)',
          'danger-light': 'var(--brand-danger-light)',
          ink: 'var(--brand-ink)',
          slate: 'var(--brand-slate)',
          mist: 'var(--brand-mist)',
          fog: 'var(--brand-fog)',
          white: 'var(--brand-white)',
          border: 'var(--brand-border)',
          'border-strong': 'var(--brand-border-strong)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
        modal: 'var(--shadow-modal)',
      },
      transitionTimingFunction: {
        'ease-out': 'var(--ease-out)',
        'ease-in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
}
