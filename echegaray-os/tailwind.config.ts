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
        // LA MARCA. Es identidad, nunca estado ni acción: el amarillo #FDC900 da 1,6:1 sobre
        // blanco y no puede llevar texto encima. Ver el porqué completo en globals.css.
        marca: { DEFAULT: 'var(--os-marca)', soft: 'var(--os-marca-soft)' },
        pos: { DEFAULT: 'var(--os-pos)', soft: 'var(--os-pos-soft)' },
        neg: { DEFAULT: 'var(--os-neg)', soft: 'var(--os-neg-soft)' },
        warn: { DEFAULT: 'var(--os-warn)', soft: 'var(--os-warn-soft)' },
        info: { DEFAULT: 'var(--os-info)', soft: 'var(--os-info-soft)' },
      },
      // EL ÚNICO MOVIMIENTO DEL SISTEMA VISUAL: la barra que dice que el servidor está trabajando.
      // Va acá y no en un `style` suelto porque un color o una animación que aparece en un
      // componente sin pasar por un token es la forma en que un sistema visual empieza a tener dos.
      animation: {
        'barra-carga': 'barra-carga 1.1s ease-in-out infinite',
      },
      borderRadius: {
        control: '6px',
        card: '10px',
      },
      boxShadow: {
        // Sombras del GRAFITO de la marca (#30302F), multicapa y muy sutiles: profundidad sin
        // ruido. Eran azuladas (rgba(10,37,64,…)), del acento navy que se retiró el 18/08.
        card: '0 1px 2px rgba(48,48,47,0.05), 0 1px 3px rgba(48,48,47,0.07)',
        pop: '0 4px 12px rgba(48,48,47,0.09), 0 12px 28px rgba(48,48,47,0.11)',
        hero: '0 1px 2px rgba(48,48,47,0.10), 0 18px 40px -20px rgba(48,48,47,0.45)',
      },
      // LA TIPOGRAFÍA — decisión canónica del handoff (`design/system/TYPOGRAPHY.md`).
      // El stack del sistema queda como FALLBACK, no como decisión: si la variable no llegó
      // (build sin red, fuente bloqueada), la pantalla sigue siendo legible con la métrica más
      // parecida que haya. Las variables las declara `next/font/google` en el layout raíz.
      fontFamily: {
        sans: [
          'var(--font-plex-sans)',
          'IBM Plex Sans',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'var(--font-plex-mono)',
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      // LAS ALTURAS DEL SISTEMA (design/system/tokens.css). Estaban repartidas como números
      // sueltos en cada componente: `h-12` acá, `h-[46px]` allá. Un token que vive en un solo
      // lugar es la única forma de que la fila de la tabla y la fila del Gantt midan igual.
      spacing: {
        header: 'var(--os-header-h)',
        fila: 'var(--os-row-h)',
        'fila-compacta': 'var(--os-row-h-compacta)',
        thead: 'var(--os-thead-h)',
        disclosure: 'var(--os-disclosure-h)',
        statusbar: 'var(--os-statusbar-h)',
        control: 'var(--os-control-h)',
        'control-movil': 'var(--os-control-h-mobile)',
      },
    },
  },
  plugins: [],
}

export default config
