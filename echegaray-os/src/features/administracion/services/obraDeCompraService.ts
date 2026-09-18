// LO QUE LA PANTALLA DE COMPRAS LEE PARA NOMBRAR LA OBRA DE CADA FILA.
//
// ═══ LA CELDA SE LEE APARTE, Y ES A PROPÓSITO ═══
//
// `destino`, `obra_id`, `obra_celda` y `obra_inconsistencia` nacen con la migración 20260915T0700, que
// se aplica a mano y no viaja con el deploy. Si entraran en el `select` de `comprasSheetService`, un
// deploy que llegue antes que la migración vaciaría la pantalla entera: PostgREST no ignora una
// columna que no existe. Leídas aparte, lo peor que pasa es `disponible: false` — la obra inferida se
// sigue viendo y el editor dice por qué todavía no se puede elegir. Mismo patrón que `codigosDeObra`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { nombresDeObra } from '../../clientes/services/nombresDeObra.ts'
import { codigosDeObra } from '../../../shared/services/codigosDeObra.ts'
import {
  obraDeLaCompra, opcionesDeObra, referenciaDeCompra,
  type AsignacionDeCompra, type CeldaObraDeCompra, type ObraDeCompra, type ObraParaOpciones,
} from './obraDeCompra.ts'

export interface CeldasObra {
  /** `false` = la base todavía no tiene las columnas (o no se pudieron leer): no se puede editar. */
  disponible: boolean
  porFila: Map<number, CeldaObraDeCompra>
}

export async function getCeldasObra(supabase: SupabaseClient): Promise<CeldasObra> {
  const { data, error } = await supabase
    .from('compra_sheet').select('fila, clave, destino, obra_id, obra_celda, obra_inconsistencia')
  if (error || !data) return { disponible: false, porFila: new Map() }
  const filas = data as unknown as CeldaObraDeCompra[]
  return { disponible: true, porFila: new Map(filas.map((c) => [c.fila, c])) }
}

/** La inferencia del sync por referencia. Error ⇒ Map vacío: sin inferencia, nunca una inventada. */
export async function getAsignaciones(supabase: SupabaseClient): Promise<Map<string, AsignacionDeCompra>> {
  const { data, error } = await supabase
    .from('compra_obra_asignada').select('referencia, obra_id, via, cliente, porque')
  if (error || !data) return new Map()
  const filas = data as unknown as AsignacionDeCompra[]
  return new Map(filas.map((a) => [a.referencia, a]))
}

/** La obra de cada fila, con UNA consulta de rótulos para todas. */
export async function obrasDeLasCompras(
  supabase: SupabaseClient,
  filas: { fila: number; sheet_id: number | null }[],
  celdas: CeldasObra,
  asignaciones: Map<string, AsignacionDeCompra>,
): Promise<Map<number, ObraDeCompra>> {
  const fuentes = filas.map((f) => ({
    fila: f.fila, celda: celdas.porFila.get(f.fila), asignacion: asignaciones.get(referenciaDeCompra(f)),
  }))
  const ids = fuentes.flatMap((x) => [x.celda?.obra_id ?? null, x.asignacion?.obra_id ?? null])
  const rotulos = await nombresDeObra(supabase, ids)
  return new Map(fuentes.map((x) => [x.fila, obraDeLaCompra(x.celda, x.asignacion, rotulos)]))
}

/** El último pedido de obra de una fila y en qué punto del viaje al Sheet quedó. */
export interface ObraEnCola {
  estado: string
  motivo: string | null
}

/**
 * EN QUÉ PUNTO DEL VIAJE AL SHEET ESTÁ LA OBRA QUE SE ELIGIÓ EN LA APP (18/09/2026).
 *
 * Hasta hoy la pantalla decía «quedó en cola para el Sheet» y nunca más. Si el worker rechazaba el
 * pedido —porque alguien cambió la celda en el Sheet mientras tanto, o la fila ya era otra compra—,
 * el sync siguiente volvía a lo que dice el Sheet y la obra elegida desaparecía sin explicación. Los
 * pagos ya tienen esta leyenda (`pagosEnCola`); la obra la necesita por el mismo motivo.
 *
 * Se lee SÓLO para la fila abierta, por `pestana = 'Compras'` y `tipo = 'obra'`: la misma cola lleva
 * Cobranzas y pagos, y la fila 57 de Cobranzas no es la 57 de Compras. Error o migración sin aplicar
 * ⇒ Map vacío: la leyenda no se dibuja, la pantalla no rompe. La traducción a texto la hace
 * `leyendaDeSheet` (`pagoDeCompra.ts`), que ya existe: una sola forma de decir «pendiente de Sheet».
 */
export async function obraEnCola(supabase: SupabaseClient, filas: number[]): Promise<Map<number, ObraEnCola>> {
  const validas = filas.filter((f) => Number.isInteger(f) && f >= 4)
  if (!validas.length) return new Map()
  const { data, error } = await supabase
    .from('compra_obra_cambio')
    .select('fila, estado, motivo, creado_at')
    .eq('pestana', 'Compras').eq('tipo', 'obra').in('fila', validas)
    .order('creado_at', { ascending: false })
  if (error || !data) return new Map()
  return ultimoPorFila(data as unknown as { fila: number; estado: string; motivo: string | null }[])
}

/** El más nuevo de cada fila, dado que vienen ordenados de nuevo a viejo. PURA. */
export function ultimoPorFila(
  cambios: { fila: number; estado: string; motivo: string | null }[],
): Map<number, ObraEnCola> {
  const out = new Map<number, ObraEnCola>()
  for (const c of cambios) if (!out.has(c.fila)) out.set(c.fila, { estado: c.estado, motivo: c.motivo })
  return out
}

/** Las opciones del desplegable. Sólo se pide con el panel abierto. Error ⇒ lista vacía. */
export async function getOpcionesDeObra(supabase: SupabaseClient): Promise<string[]> {
  const [{ data, error }, codigos] = await Promise.all([
    supabase.from('obra_canonica').select('id, nombre, cliente_texto, fusionada_en'),
    codigosDeObra(supabase, null),
  ])
  if (error || !data) return []
  return opcionesDeObra(data as unknown as ObraParaOpciones[], codigos)
}
