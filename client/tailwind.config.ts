import type { Config } from 'tailwindcss';

/**
 * Design tokens rooted in the Stitch project "Resume Insight Analyzer"
 * (projects/8382454718420959342) — its Material 3 palette, Plus Jakarta Sans /
 * Inter pairing and 4/8/16/24/40px spacing scale.
 *
 * Evolved from that base: gradient accents, a wider spacing scale for more
 * breathing room, and a motion system. Colours resolve through CSS variables so
 * one `.dark` class on <html> swaps the whole system.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--on-primary-container) / <alpha-value>)',

        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',

        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        'on-secondary': 'rgb(var(--on-secondary) / <alpha-value>)',
        tertiary: 'rgb(var(--tertiary) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--on-tertiary) / <alpha-value>)',

        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
        'on-error': 'rgb(var(--on-error) / <alpha-value>)',

        background: 'rgb(var(--background) / <alpha-value>)',
        'on-background': 'rgb(var(--on-background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'on-surface': 'rgb(var(--on-surface) / <alpha-value>)',
        'surface-variant': 'rgb(var(--surface-variant) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--on-surface-variant) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--surface-container-highest) / <alpha-value>)',

        outline: 'rgb(var(--outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--outline-variant) / <alpha-value>)',
      },

      // Stitch scale, extended upward for the roomier layout.
      spacing: {
        base: '4px',
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
        '2xl': '64px',
        '3xl': '96px',
        gutter: '24px',
        'sidebar-width': '272px',
        'container-max': '1520px',
      },

      /**
       * The default opacity scale jumps 5 -> 10 -> 20, but this design leans on
       * very light colour washes. `@apply` only accepts values present on this
       * scale (unlike class strings, where the JIT accepts arbitrary ones), so
       * the intermediate steps have to be declared for both to agree.
       */
      opacity: {
        8: '0.08',
        12: '0.12',
        16: '0.16',
        35: '0.35',
        45: '0.45',
        65: '0.65',
      },

      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        full: '9999px',
      },

      fontFamily: {
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        heading: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      fontSize: {
        'display-2xl': ['76px', { lineHeight: '80px', letterSpacing: '-0.04em', fontWeight: '800' }],
        'display-xl': ['60px', { lineHeight: '66px', letterSpacing: '-0.035em', fontWeight: '800' }],
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.028em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['22px', { lineHeight: '30px', letterSpacing: '-0.012em', fontWeight: '650' }],
        'title': ['17px', { lineHeight: '24px', letterSpacing: '-0.006em', fontWeight: '600' }],
        'body-lg': ['17px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['15px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['13.5px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['11.5px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '600' }],
      },

      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px -2px rgb(0 0 0 / 0.06)',
        lift: '0 2px 4px rgb(0 0 0 / 0.05), 0 12px 28px -6px rgb(0 0 0 / 0.12)',
        glow: '0 0 0 1px rgb(var(--primary) / 0.25), 0 8px 32px -8px rgb(var(--primary) / 0.45)',
      },

      transitionTimingFunction: {
        // A gentle overshoot-free ease that suits sliding panels.
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
        snappy: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      keyframes: {
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(28px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-28px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'expand-down': {
          from: { opacity: '0', maxHeight: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', maxHeight: '900px', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(200%)' },
        },
        'gradient-drift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },

      animation: {
        'slide-up': 'slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-down': 'slide-down 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-left': 'slide-in-left 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'expand-down': 'expand-down 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s infinite',
        'gradient-drift': 'gradient-drift 12s ease infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
