// Formateo de valores para toda la UI del OS — fuente única, reemplaza las copias de
// `money`/`pct` que vivían duplicadas en cada componente de Ingeniería Financiera.
// No calcula nada de negocio: sólo presenta números que ya vienen de las tablas del motor.

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/** Pesos argentinos sin decimales. `null`/`undefined`/no-finito → '—'. */
export function money(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? ARS.format(n) : '—'
}

/** Como `money`, pero un 0 también se muestra como '—' (para columnas donde 0 = nada). */
export function money0(n: number | null | undefined): string {
  return n ? money(n) : '—'
}

/** Pesos compactos para celdas muy chicas: 1.250.000 → '+1,3M', 48.000 → '+48k'. */
export function moneyK(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return ''
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : '+'
  if (abs >= 1_000_000) return `${signo}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (abs >= 1_000) return `${signo}${Math.round(abs / 1_000)}k`
  return `${signo}${Math.round(abs)}`
}

/** Fracción (0,153) → '15,3%'. Recibe la fracción, no el porcentaje. */
export function pct(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${(n * 100).toFixed(1).replace('.', ',')}%` : '—'
}
