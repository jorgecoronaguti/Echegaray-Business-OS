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
