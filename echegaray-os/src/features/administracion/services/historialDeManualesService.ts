// LEER EL LOG DE LO ESCRITO A MANO: UNA LECTURA POR QUINCENA, NO UNA POR CELDA.
//
// Una quincena tiene ~17 personas × hasta 13 celdas con punto ámbar. Pedir el historial al pasar el mouse sería un
// viaje por celda y un panel vacío mientras llega; traerlo todo junto es una consulta con el filtro de la quincena y
// el panel abre al instante. La traducción a lo que se dibuja es `historialDeManuales.ts` (pura).
//
// LA RLS ES LA PUERTA (`liquida_sueldos()`): quien no liquida lee cero filas, y eso no se confunde con «sin cambios»
// porque el punto ámbar sólo se dibuja en pantallas que ya son de quien liquida.
//
// SIN LA MIGRACIÓN (20261001T0200) la tabla no existe: se contesta `null` y el punto conserva su título de siempre. Un
// log que no se puede leer no se dibuja como un log vacío.

import type { SupabaseClient } from '@supabase/supabase-js'
import { nombresDeUsuarios } from '../../../shared/personas/nombresDeUsuarios.ts'
import type { Quincena } from './quincena.ts'
import { historialDeCeldas, type CambioCrudo, type HistorialDeLaQuincena } from './historialDeManuales.ts'

const COLUMNAS = 'id, liquidacion_id, persona_id, columna, tipo, antes, despues, formula_antes, formula_despues, autor, en, liquidacion_quincena!inner(grupo, desde, hasta)'
const PAGINA = 1000

export interface LecturaDelHistorial {
  /** `null` = no hay log que mostrar (tabla sin aplicar o lectura fallida): la pantalla no afirma nada. */
  historial: HistorialDeLaQuincena | null
  error: string | null
}

type FilaConCabecera = Omit<CambioCrudo, 'grupo'> & { liquidacion_quincena: { grupo: string } | { grupo: string }[] | null }

const grupoDe = (f: FilaConCabecera): string | null => {
  const c = Array.isArray(f.liquidacion_quincena) ? f.liquidacion_quincena[0] : f.liquidacion_quincena
  return c?.grupo ?? null
}

/** 42P01 = la tabla no existe; PGRST205 = PostgREST no la conoce (caché de esquema). */
const tablaSinAplicar = (e: { code?: string; message: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /liquidacion_cambio/.test(e.message) && /does not exist|schema cache/i.test(e.message)

export async function leerHistorialDeLaQuincena(supabase: SupabaseClient, q: Quincena): Promise<LecturaDelHistorial> {
  const crudas: FilaConCabecera[] = []
  // PAGINADO: PostgREST corta en `db-max-rows` con un 200 y sin error; un log truncado en silencio mostraría
  // «sin registro» sobre cambios que sí existen.
  for (let desde = 0; ; desde += PAGINA) {
    const r = await supabase.from('liquidacion_cambio').select(COLUMNAS)
      .eq('liquidacion_quincena.desde', q.desde).eq('liquidacion_quincena.hasta', q.hasta)
      .order('id', { ascending: true }).range(desde, desde + PAGINA - 1)
    if (r.error) return tablaSinAplicar(r.error) ? { historial: null, error: null } : { historial: null, error: r.error.message }
    const pagina = (r.data ?? []) as unknown as FilaConCabecera[]
    crudas.push(...pagina)
    if (pagina.length < PAGINA) break
  }
  const filas: CambioCrudo[] = []
  for (const f of crudas) {
    const grupo = grupoDe(f)
    if (grupo) filas.push({ ...f, grupo })
  }
  const hayAutores = filas.some((f) => f.autor !== null)
  const nombres = hayAutores ? await nombresDeUsuarios(supabase) : new Map<string, string>()
  return { historial: historialDeCeldas(filas, nombres), error: null }
}
