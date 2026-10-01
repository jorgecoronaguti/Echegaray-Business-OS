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

// ═══ EL RECORTE «CLIENTE» (dueño, 01/10/2026) ═══
//
// *«dame filtros de liq de hs por cliente, es decir las personas que están asignadas a cada cliente, así es más
// fácil el tema impresión de recibos»*. El cliente de una persona es el de su obra ACTUAL
// (`persona_directorio.obra_actual_id` → `obra_canonica.cliente_id` → `clientes.nombre_comercial`): los recibos
// se reparten donde la gente está hoy. Quien no tiene obra, o su obra no tiene cliente, va en «Sin cliente».

export const SIN_CLIENTE = 'sin_cliente'

export interface ClienteDePersona { id: string; nombre: string }
/** persona → cliente de su obra actual. Sin entrada = sin obra asignada, u obra sin cliente. */
export type ClientePorPersona = Readonly<Record<string, ClienteDePersona>>

/**
 * Las opciones del recorte, sólo con los clientes que tienen a alguien de ESTAS personas: los de más gente
 * primero. Vacío cuando no hay ningún cliente que ofrecer (un grupo con sólo «Todos» no filtra nada).
 */
export function opcionesDeCliente(
  personas: readonly string[], mapa: ClientePorPersona,
): { clave: string; texto: string }[] {
  const cuenta = new Map<string, { texto: string; n: number }>()
  let sin = 0
  for (const id of personas) {
    const c = mapa[id]
    if (!c) { sin += 1; continue }
    cuenta.set(c.id, { texto: c.nombre, n: (cuenta.get(c.id)?.n ?? 0) + 1 })
  }
  if (cuenta.size === 0) return []
  const clientes = [...cuenta.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].texto.localeCompare(b[1].texto, 'es'))
    .map(([clave, v]) => ({ clave, texto: v.texto }))
  return [{ clave: 'todos', texto: 'Todos' }, ...clientes, ...(sin > 0 ? [{ clave: SIN_CLIENTE, texto: 'Sin cliente' }] : [])]
}

/** El recorte pedido por la URL, o «todos» si no es una de las opciones que hay. */
export const clientePedido = (v: string | undefined, opciones: readonly { clave: string }[]): string =>
  opciones.find((o) => o.clave === v)?.clave ?? 'todos'

export const pasaCliente = (personaId: string, recorte: string, mapa: ClientePorPersona): boolean =>
  recorte === 'todos' || (recorte === SIN_CLIENTE ? !mapa[personaId] : mapa[personaId]?.id === recorte)

/** Las filas que pasan el recorte y el buscador. El pie se calcula sobre ESTAS, no sobre el plantel. */
export function recortar<T extends { grupo: GrupoLiquidacion; nombre: string }>(
  filas: readonly T[], grupo: GrupoLiquidacion | 'todos', buscar: string | undefined,
): T[] {
  const b = normalizar(buscar ?? '')
  return filas
    .filter((f) => grupo === 'todos' || f.grupo === grupo)
    .filter((f) => !b || normalizar(f.nombre).includes(b))
}
