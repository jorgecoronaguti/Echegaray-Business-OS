// EL RECORTE «COBRA» Y EL BUSCADOR DE LIQUIDACIÓN — una sola definición para el cuadro y Recibos.
//
// Estaban escritos dentro de `solapas/quincena.tsx`. Recibos necesita el mismo filtro y el mismo
// buscador (coordinador, 14/09/2026: «mismo filtro y buscador»); copiarlos daría dos pantallas que
// recortan distinto sobre la misma quincena, y un pie de Recibos que no cierra con el del cuadro.
//
// CÓMO COBRA, NO EN QUÉ CUADRO ESTÁ. Dueño, 14/09/2026: *«si solo quiero ver los valores de los que
// cobran en quincena no puedo»*. La clave sigue siendo el cuadro porque la modalidad la impone el
// cuadro (`modalidadDe`): obreros = por hora, liquidados por quincena; oficina = neto mensual.

import type { GrupoLiquidacion } from './liquidacionQuincena.ts'

export const RECORTES: { clave: GrupoLiquidacion | 'todos'; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'obreros', texto: 'Por quincena' },
  { clave: 'oficina', texto: 'Mensuales' },
  { clave: 'final', texto: 'Liq. finales' },
]

/** Sin tildes ni mayúsculas: «aguero» encuentra a «AGÜERO CRISTIAN». */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** El recorte pedido por la URL, o «todos» si no es uno conocido. */
export const recortePedido = (grupo: string | undefined): GrupoLiquidacion | 'todos' =>
  RECORTES.find((r) => r.clave === grupo)?.clave ?? 'todos'

// ═══ EL RECORTE «PRESENTISMO» (dueño, 01/10/2026) ═══
//
// *«dame un filtro ahí en liq hs para ver sólo a los que ganan presentismo y no»*. Mira el MISMO estado que
// dibuja la celda de la columna Presentismo (`presentismo.ts`), no una cuenta propia:
//
//   gana      `aplica` — cumple, o lo perdió y Administración se lo restituyó
//   no_gana   `perdido`, o todavía sin horas pero con una falta o tardanza ya cargada (la celda en ámbar)
//
// Quien no entra al presentismo —mensual, quincena en la que no rige, sin categoría, sin horas y sin
// causa— no está en ninguno de los dos: sólo se ve en «Todos».

export type RecortePresentismo = 'todos' | 'gana' | 'no_gana'

export const RECORTES_PRESENTISMO: { clave: RecortePresentismo; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'gana', texto: 'Lo gana' },
  { clave: 'no_gana', texto: 'No lo gana' },
]

export const presentismoPedido = (v: string | undefined): RecortePresentismo =>
  RECORTES_PRESENTISMO.find((r) => r.clave === v)?.clave ?? 'todos'

/** Lo que el recorte necesita de `PresentismoDeLinea`: el estado y los días que lo hacen perder. */
export interface PresentismoParaRecortar { estado: string; perdido: readonly string[] }

export function claseDePresentismo(p: PresentismoParaRecortar | null | undefined): 'gana' | 'no_gana' | null {
  if (!p) return null
  if (p.estado === 'aplica') return 'gana'
  if (p.estado === 'perdido') return 'no_gana'
  if (p.estado === 'sin_horas' && p.perdido.length > 0) return 'no_gana'
  return null
}

export const pasaPresentismo = (p: PresentismoParaRecortar | null | undefined, recorte: RecortePresentismo): boolean =>
  recorte === 'todos' || claseDePresentismo(p) === recorte

/** Las filas que pasan el recorte y el buscador. El pie se calcula sobre ESTAS, no sobre el plantel. */
export function recortar<T extends { grupo: GrupoLiquidacion; nombre: string }>(
  filas: readonly T[], grupo: GrupoLiquidacion | 'todos', buscar: string | undefined,
): T[] {
  const b = normalizar(buscar ?? '')
  return filas
    .filter((f) => grupo === 'todos' || f.grupo === grupo)
    .filter((f) => !b || normalizar(f.nombre).includes(b))
}
