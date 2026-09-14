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

/** Las filas que pasan el recorte y el buscador. El pie se calcula sobre ESTAS, no sobre el plantel. */
export function recortar<T extends { grupo: GrupoLiquidacion; nombre: string }>(
  filas: readonly T[], grupo: GrupoLiquidacion | 'todos', buscar: string | undefined,
): T[] {
  const b = normalizar(buscar ?? '')
  return filas
    .filter((f) => grupo === 'todos' || f.grupo === grupo)
    .filter((f) => !b || normalizar(f.nombre).includes(b))
}
