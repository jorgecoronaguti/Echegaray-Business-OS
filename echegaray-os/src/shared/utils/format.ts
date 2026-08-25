// Formateo de valores para toda la UI del OS — fuente única, reemplaza las copias de
// `money`/`pct` que vivían duplicadas en cada componente de Ingeniería Financiera.
// No calcula nada de negocio: sólo presenta números que ya vienen de las tablas del motor.
//
// ═══ ACÁ CONVIVEN DOS FAMILIAS, Y ES A PROPÓSITO (21/08/2026) ═══
//
// Al traer el formato de Obras y de Integraciones a este archivo quedó a la vista que `money` y
// `plata` NO son la misma función: `money` usa `Intl` con `style: 'currency'` y devuelve «$ 1.234»
// (con espacio duro), y `plata` arma «$1.234» a mano. Lo mismo con `pct` (recibe la FRACCIÓN 0,153 y
// escribe «15,3%») contra `porcentaje` (recibe el PORCENTAJE 35 y escribe «35 %»), y con `moneyK`
// («+1,3M», sin signo de peso, '' para el cero) contra `plataCorta` («$74,3M»).
//
// Fusionarlas cambiaría el texto de pantallas ya aprobadas: dos familias con nombres distintos es la
// forma honesta de tener una sola copia de cada regla. Lo que NO puede volver a pasar es que la
// misma regla viva en dos archivos — por eso están todas acá.

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FAMILIA DE OBRAS Y OPERACIÓN — vivía en `features/obras/components/formato.ts` y en
// `features/integraciones/components/formato.ts`, que hoy sólo re-exportan desde acá.
//
// EL VACÍO NUNCA SE PRESENTA COMO CERO. `plata(null)` da '—' y no '$0': un contratado sin cargar y
// un contrato de cero pesos son cosas distintas, y confundirlas es fabricar un dato. Donde el '—'
// no alcanza, la pantalla escribe al lado QUÉ falta — para eso está `FaltaDato`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Pesos sin decimales, armados a mano: `$1.234`. Distinto de `money` — ver la cabecera. */
export const plata = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR')

/** Plata ABREVIADA, para los titulares donde la cifra compite por el ancho con otras tres.
 *  `$74M` en vez de `$74.300.000`. El número exacto vive en Economía: acá se decide si mirarlo.
 *  El decimal aparece sólo por debajo de 10 unidades de la escala (`$8,4M`, `$74M`): con dos cifras
 *  enteras no cambia ninguna decisión y sí ocupa el ancho por el que existe esta función. */
export const plataCorta = (n: number | null | undefined) => {
  if (n == null) return '—'
  const a = Math.abs(n)
  const s = n < 0 ? '-$' : '$'
  const f = (x: number, u: string) =>
    s + x.toLocaleString('es-AR', { maximumFractionDigits: x < 10 ? 1 : 0 }) + u
  if (a >= 1e9) return f(n / 1e9 * (n < 0 ? -1 : 1), 'MM')
  if (a >= 1e6) return f(n / 1e6 * (n < 0 ? -1 : 1), 'M')
  if (a >= 1e3) return f(n / 1e3 * (n < 0 ? -1 : 1), 'k')
  return s + Math.round(a).toLocaleString('es-AR')
}

/** Un porcentaje YA en escala 0–100, con el espacio del es-AR: `35 %`. `null` no es `0 %`:
 *  devuelve `null` y la pantalla escribe qué falta. */
export const porcentaje = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`

/** Horas con un decimal: las HH vienen en `numeric` y 12.5 no es 12. */
export const horas = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })} HH`

/** HH sin decimales: en obra nadie planifica media hora hombre. */
export const hh = (n: number | null | undefined) =>
  n == null ? null : Math.round(Number(n)).toLocaleString('es-AR')

/** Un porcentaje de desvío con su signo. Positivo = por encima de lo planificado. */
export const desvio = (n: number | null | undefined) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

/**
 * Una cantidad en es-AR, sin inventar decimales, con su unidad opcional: `2,84 m³`.
 * `null`/`undefined` siguen siendo `null`: no es cero, y la celda escribe la ausencia.
 *
 * ═══ LAS DOS COPIAS ERAN LA MISMA REGLA, SALVO EN UN BORDE (21/08/2026) ═══
 *
 * Obras la escribía con unidad y sin validar, Integraciones sin unidad y descartando lo no finito.
 * Para todo número real las dos dan el MISMO texto. Se conserva la versión que valida: un dato
 * ilegible se muestra como ausente y no como la palabra «NaN» en una columna de cantidades. La
 * coerción con `Number` se conserva de la de Obras, porque de Postgres un `numeric` puede llegar
 * como texto y descartarlo dejaría la celda vacía teniendo el dato.
 */
export const cantidad = (n: number | string | null | undefined, unidad?: string | null) => {
  if (n == null) return null
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  return `${x.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ''}`
}
