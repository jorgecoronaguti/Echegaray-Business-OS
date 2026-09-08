import type { Config } from 'tailwindcss'

// SISTEMA VISUAL DEL BUSINESS OS — la capa Tailwind del design system.
// Los valores viven como CSS vars en src/app/globals.css (fuente única); acá sólo se
// exponen como utilidades semánticas reutilizables por TODO el OS: bg-surface, text-ink,
// border-line, text-pos/neg/warn, shadow-card, rounded-card, etc. Es aditivo: no altera
// las utilidades estándar de Tailwind que ya usan otros módulos (slate-*, white…).
// TODO COLOR DEL TEMA SE DECLARA CON `<alpha-value>`, SIN EXCEPCIÓN.
// Un color escrito `var(--os-x)` no admite el modificador de opacidad de Tailwind: `border-ink/30`
// salía al 100% y `from-ink/15` no generaba regla, porque el alfa no puede entrar adentro de una
// variable que ya trae la función de color. Con `rgb(var(--os-x-rgb) / <alpha-value>)` Tailwind
// reemplaza el marcador por 1 —la clase sin modificador queda igual— o por el modificador pedido.
// Los canales sueltos los publica `src/app/globals.css` y van escritos enteros —sin una función
// que los arme— para que `src/app/tokens-tema.test.ts` pueda leerlos del archivo y exigir que cada
// color del tema use `<alpha-value>` y que el par hex ↔ rgb diga lo mismo.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--os-canvas-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--os-surface-rgb) / <alpha-value>)',
          quiet: 'rgb(var(--os-surface-quiet-rgb) / <alpha-value>)',
          sunken: 'rgb(var(--os-surface-sunken-rgb) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--os-line-rgb) / <alpha-value>)',
          strong: 'rgb(var(--os-line-strong-rgb) / <alpha-value>)',
          // El hairline MÁS suave: separador ENTRE bloques de un mismo panel. Estaba declarado en
          // `globals.css` desde el handoff y NO estaba expuesto acá, así que los componentes lo
          // escribían a mano. Un token que hay que copiar a mano no es un token.
          hairline: 'rgb(var(--os-hairline-soft-rgb) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--os-ink-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-ink-soft-rgb) / <alpha-value>)',
        },
        muted: 'rgb(var(--os-muted-rgb) / <alpha-value>)',
        faint: 'rgb(var(--os-faint-rgb) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--os-accent-rgb) / <alpha-value>)',
          hover: 'rgb(var(--os-accent-hover-rgb) / <alpha-value>)',
        },
        // LA MARCA. Es identidad, nunca estado ni acción: el amarillo #FDC900 da 1,6:1 sobre
        // blanco y no puede llevar texto encima. Ver el porqué completo en globals.css.
        marca: {
          DEFAULT: 'rgb(var(--os-marca-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-marca-soft-rgb) / <alpha-value>)',
          track: 'rgb(var(--os-marca-track-rgb) / <alpha-value>)',
        },
        pos: {
          DEFAULT: 'rgb(var(--os-pos-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-pos-soft-rgb) / <alpha-value>)',
        },
        neg: {
          DEFAULT: 'rgb(var(--os-neg-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-neg-soft-rgb) / <alpha-value>)',
        },
        warn: {
          DEFAULT: 'rgb(var(--os-warn-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-warn-soft-rgb) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--os-info-rgb) / <alpha-value>)',
          soft: 'rgb(var(--os-info-soft-rgb) / <alpha-value>)',
        },
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
