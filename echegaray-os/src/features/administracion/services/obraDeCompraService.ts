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

/** Las opciones del desplegable. Sólo se pide con el panel abierto. Error ⇒ lista vacía. */
export async function getOpcionesDeObra(supabase: SupabaseClient): Promise<string[]> {
  const [{ data, error }, codigos] = await Promise.all([
    supabase.from('obra_canonica').select('id, nombre, cliente_texto, fusionada_en'),
    codigosDeObra(supabase, null),
  ])
  if (error || !data) return []
  return opcionesDeObra(data as unknown as ObraParaOpciones[], codigos)
}
