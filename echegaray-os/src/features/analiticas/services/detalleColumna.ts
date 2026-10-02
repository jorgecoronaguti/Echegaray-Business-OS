// EL DETALLE QUE ABRE UNA COLUMNA DE LOS GRÁFICOS DE ANALÍTICAS (dueño, 02/10/2026: «si paso por arriba el
// mouse en esos gráficos me tiene que indicar los valores»).
//
// Lo arma una función pura para poder probar QUÉ dice sin renderizar: el mes, el total, cada tramo con su
// nombre y su importe, y los sellos del mes (real/estimado/parcial). Los importes salen de `millones`, la
// misma escala que la tabla de abajo: dos precisiones distintas para la misma cifra no se pueden leer una
// contra otra. Una barra sin dato dice «sin medir», nunca un total de $ 0.

import { millones } from './formato.ts'

export interface TramoDeColumna {
  nombre: string
  /** `null` = el tramo no se pudo medir: se nombra, no se muestra como 0. */
  monto: number | null
}

export interface DetalleDeColumna {
  titulo: string
  /** `null` = barra sin dato. */
  total: string | null
  filas: { nombre: string; importe: string }[]
  /** Sellos del mes y, sin dato, su motivo. */
  notas: string[]
  /** La misma información como una frase, para lectores de pantalla. */
  aria: string
}

export function detalleDeColumna(d: {
  titulo: string
  total: number | null
  tramos: readonly TramoDeColumna[]
  sellos?: readonly string[]
  /** Motivo cuando no hay dato («sin medir»). */
  sinDato?: string
}): DetalleDeColumna {
  const total = d.total == null ? null : millones(d.total)
  const filas = d.total == null ? [] : d.tramos.map((t) => ({ nombre: t.nombre, importe: millones(t.monto) ?? 'sin medir' }))
  const notas = [...(d.sellos ?? []).filter(Boolean), ...(total == null ? [d.sinDato ?? 'sin medir'] : [])]
  const aria = [
    total == null ? `${d.titulo}: ${notas.join(', ')}` : `${d.titulo}: total ${total}`,
    ...filas.map((f) => `${f.nombre} ${f.importe}`),
    ...(total == null ? [] : notas),
  ].join('. ')
  return { titulo: d.titulo, total, filas, notas, aria }
}
