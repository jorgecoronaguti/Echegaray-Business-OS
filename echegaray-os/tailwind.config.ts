import type { Config } from 'tailwindcss'

// SISTEMA VISUAL DEL BUSINESS OS — la capa Tailwind del design system.
// Los valores viven como CSS vars en src/app/globals.css (fuente única); acá sólo se
// exponen como utilidades semánticas reutilizables por TODO el OS: bg-surface, text-ink,
// border-line, text-pos/neg/warn, shadow-card, rounded-card, etc. Es aditivo: no altera
// las utilidades estándar de Tailwind que ya usan otros módulos (slate-*, white…).
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--os-canvas)',
        surface: {
          DEFAULT: 'var(--os-surface)',
          quiet: 'var(--os-surface-quiet)',
          sunken: 'var(--os-surface-sunken)',
        },
        line: {
          DEFAULT: 'var(--os-line)',
          strong: 'var(--os-line-strong)',
        },
        ink: {
          DEFAULT: 'var(--os-ink)',
          soft: 'var(--os-ink-soft)',
        },
        muted: 'var(--os-muted)',
        faint: 'var(--os-faint)',
        accent: {
          DEFAULT: 'var(--os-accent)',
          hover: 'var(--os-accent-hover)',
        },
        pos: { DEFAULT: 'var(--os-pos)', soft: 'var(--os-pos-soft)' },
        neg: { DEFAULT: 'var(--os-neg)', soft: 'var(--os-neg-soft)' },
        warn: { DEFAULT: 'var(--os-warn)', soft: 'var(--os-warn-soft)' },
        info: { DEFAULT: 'var(--os-info)', soft: 'var(--os-info-soft)' },
      },
      borderRadius: {
        control: '6px',
        card: '10px',
      },
      boxShadow: {
        // Sombras azuladas multicapa muy sutiles — profundidad sin ruido.
        card: '0 1px 2px rgba(10,37,64,0.04), 0 1px 3px rgba(10,37,64,0.06)',
        pop: '0 4px 12px rgba(10,37,64,0.08), 0 12px 28px rgba(10,37,64,0.10)',
        hero: '0 1px 2px rgba(10,37,64,0.10), 0 18px 40px -20px rgba(10,37,64,0.45)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}

export default config
