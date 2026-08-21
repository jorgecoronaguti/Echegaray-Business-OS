// FORMATO DEL MÓDULO DE OBRAS — una sola copia de las tres funciones que usaban seis pantallas.
//
// EL VACÍO NUNCA SE PRESENTA COMO CERO. `plata(null)` da '—' y no '$0': un contratado sin cargar y
// un contrato de cero pesos son cosas distintas, y confundirlas es fabricar un dato. Donde el '—'
// no alcanza, la pantalla escribe al lado QUÉ falta — para eso está `FaltaDato`.

export const plata = (n: number | null | undefined) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR')

/** Una fecha ISO (YYYY-MM-DD) en formato local, leída en UTC para que no se corra un día. */
export const fecha = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
      })
    : '—'

/** Horas con un decimal: las HH vienen en `numeric` y 12.5 no es 12. */
export const horas = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })} HH`

/** Un porcentaje de desvío con su signo. Positivo = por encima de lo planificado. */
export const desvio = (n: number | null | undefined) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

/** Plata ABREVIADA, para los titulares donde la cifra compite por el ancho con otras tres.
 *  `$74,3M` en vez de `$74.300.000`. El número exacto vive en Economía: acá se decide si mirarlo. */
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

/** Un porcentaje con el espacio del es-AR: `35 %`. `null` no es `0 %`: devuelve `null` y la
 *  pantalla escribe qué falta. */
export const porcentaje = (n: number | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`

/** `DD/MM` — el formato de la columna PLAZO, donde el año no aporta y sí ocupa.
 *
 *  SE ARMA A MANO Y NO CON `toLocaleDateString`: con `day: '2-digit'` el ICU del navegador igual
 *  devuelve `26/6` en es-AR, y una columna donde unas fechas miden cinco caracteres y otras cuatro
 *  deja de estar alineada — que es lo único para lo que existe una columna de fechas en mono. */
export const fechaCorta = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null

/** Una cantidad con su unidad: `2,84 m³`. Sin unidad, sólo el número. */
export const cantidad = (n: number | null | undefined, unidad: string | null | undefined) =>
  n == null ? null : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unidad ? ` ${unidad}` : ''}`

/** HH sin decimales: en obra nadie planifica media hora hombre. */
export const hh = (n: number | null | undefined) =>
  n == null ? null : Math.round(Number(n)).toLocaleString('es-AR')
