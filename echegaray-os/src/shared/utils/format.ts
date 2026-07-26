// Formateo de valores para toda la UI del OS — fuente única, reemplaza las copias de
// `money`/`pct` que vivían duplicadas en cada componente de Ingeniería Financiera.
// No calcula nada de negocio: sólo presenta números que ya vienen de las tablas del motor.

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// Un número puede llegar como number O como STRING numérico: Postgres devuelve los `numeric`/`decimal`
// como texto ("0.6278", "18200000") y así quedan en el JSONB de las tablas del motor. Coercer acá —una
// sola vez— evita que una tabla se vea con "—" cuando el dato en realidad está. No es cálculo: es
// normalizar el tipo para presentar. `null`/`undefined`/vacío/no-numérico → null (se muestra como '—').
function aNumero(n: number | string | null | undefined): number | null {
  if (typeof n === 'number') return Number.isFinite(n) ? n : null
  if (typeof n === 'string' && n.trim() !== '') {
    const x = Number(n)
    return Number.isFinite(x) ? x : null
  }
  return null
}

/** Pesos argentinos sin decimales. `null`/`undefined`/no-finito → '—'. Acepta número o número en texto. */
export function money(n: number | string | null | undefined): string {
  const x = aNumero(n)
  return x === null ? '—' : ARS.format(x)
}

/** Como `money`, pero un 0 también se muestra como '—' (para columnas donde 0 = nada). */
export function money0(n: number | string | null | undefined): string {
  const x = aNumero(n)
  return x ? money(x) : '—'
}

/** Pesos compactos para celdas muy chicas: 1.250.000 → '+1,3M', 48.000 → '+48k'. */
export function moneyK(n: number | string | null | undefined): string {
  const x = aNumero(n)
  if (x === null || x === 0) return ''
  const abs = Math.abs(x)
  const signo = x < 0 ? '−' : '+'
  if (abs >= 1_000_000) return `${signo}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (abs >= 1_000) return `${signo}${Math.round(abs / 1_000)}k`
  return `${signo}${Math.round(abs)}`
}

/** Fracción (0,153) → '15,3%'. Recibe la fracción, no el porcentaje. Acepta número o número en texto. */
export function pct(n: number | string | null | undefined): string {
  const x = aNumero(n)
  return x === null ? '—' : `${(x * 100).toFixed(1).replace('.', ',')}%`
}
