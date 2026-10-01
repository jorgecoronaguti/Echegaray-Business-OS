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
import { createAdminClient } from '@/lib/supabase/admin'
import {
  historialDeCeldas, INICIO_DEL_REGISTRO, type CambioCrudo, type CruceConElRegistro, type HistorialDeLaQuincena, type PostDelRegistro,
} from './historialDeManuales.ts'

const COLUMNAS_SIN_ORIGEN = 'id, liquidacion_id, persona_id, columna, tipo, antes, despues, formula_antes, formula_despues, autor, en, liquidacion_quincena!inner(grupo, desde, hasta)'
// `origen` (20261001T0700): sin esa migración la columna no existe y se lee sin ella; el log sigue andando.
const COLUMNAS = `${COLUMNAS_SIN_ORIGEN}, origen`
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

/**
 * EL CRUCE PARA LO ESCRITO ANTES DEL TRIGGER: `liquidacion_linea.actualizado_en` contra los POST de Liquidación de
 * `app_registro` (tabla interna: sólo la clave de servicio la lee, y sólo se llega acá con filas que la RLS del log ya
 * dejó pasar). Sólo se piden los POST de los minutos que importan; sin líneas posteriores al inicio del registro no se
 * hace ninguna lectura. Un fallo devuelve `null`: se dice «anterior al registro», que es lo que se puede afirmar.
 */
async function cruceConElRegistro(supabase: SupabaseClient, filas: readonly CambioCrudo[]): Promise<CruceConElRegistro | null> {
  const base = filas.filter((f) => f.tipo === 'base')
  if (base.length === 0) return null
  try {
    const lineas = await supabase.from('liquidacion_linea').select('liquidacion_id, persona_id, actualizado_en')
      .in('liquidacion_id', [...new Set(base.map((f) => f.liquidacion_id))])
    if (lineas.error) return null
    const actualizadoEn = new Map<string, string | null>(
      ((lineas.data ?? []) as { liquidacion_id: string; persona_id: string; actualizado_en: string | null }[])
        .map((l) => [`${l.liquidacion_id}|${l.persona_id}`, l.actualizado_en]),
    )
    const instantes = [...actualizadoEn.values()].filter((a): a is string => !!a && Date.parse(a) >= Date.parse(INICIO_DEL_REGISTRO))
    if (instantes.length === 0) return { actualizadoEn, posts: [] }
    const ms = instantes.map((a) => Date.parse(a))
    const registro = await createAdminClient().from('app_registro').select('perfil_id, en')
      .eq('tipo', 'accion').eq('metodo', 'POST').eq('ruta', '/administracion/personas')
      .gte('en', new Date(Math.min(...ms) - 60_000).toISOString()).lte('en', new Date(Math.max(...ms) + 60_000).toISOString())
      .limit(5000)
    if (registro.error) return { actualizadoEn, posts: [] }
    return { actualizadoEn, posts: (registro.data ?? []) as PostDelRegistro[] }
  } catch {
    return null
  }
}

export async function leerHistorialDeLaQuincena(supabase: SupabaseClient, q: Quincena): Promise<LecturaDelHistorial> {
  const crudas: FilaConCabecera[] = []
  let columnas = COLUMNAS
  // PAGINADO: PostgREST corta en `db-max-rows` con un 200 y sin error; un log truncado en silencio mostraría
  // «sin registro» sobre cambios que sí existen.
  for (let desde = 0; ; desde += PAGINA) {
    let r = await supabase.from('liquidacion_cambio').select(columnas)
      .eq('liquidacion_quincena.desde', q.desde).eq('liquidacion_quincena.hasta', q.hasta)
      .order('id', { ascending: true }).range(desde, desde + PAGINA - 1)
    if (r.error && r.error.code === '42703' && columnas === COLUMNAS) {
      columnas = COLUMNAS_SIN_ORIGEN
      r = await supabase.from('liquidacion_cambio').select(columnas)
        .eq('liquidacion_quincena.desde', q.desde).eq('liquidacion_quincena.hasta', q.hasta)
        .order('id', { ascending: true }).range(desde, desde + PAGINA - 1)
    }
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
  const cruce = await cruceConElRegistro(supabase, filas)
  // Los nombres también sirven a los `perfil_id` del registro, no sólo al `autor` de los cambios.
  const hayNombres = filas.some((f) => f.autor !== null) || (cruce?.posts.length ?? 0) > 0
  const nombres = hayNombres ? await nombresDeUsuarios(supabase) : new Map<string, string>()
  return { historial: historialDeCeldas(filas, nombres, cruce), error: null }
}
