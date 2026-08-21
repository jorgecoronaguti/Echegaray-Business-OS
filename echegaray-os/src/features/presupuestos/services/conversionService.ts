// LA CONVERSIÓN — lo que la pantalla 13 necesita LEER antes de generar nada.
//
// Las plantillas de secuencia NO son universales: cada tipología define la suya, y son datos, no
// código. Arrancan tres —hormigón vertical, hormigón horizontal, mampostería— y se editan desde la
// base maestra. Por eso se leen; no hay una constante con los pasos en ningún lado.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type { Plantilla } from '../types'

type Fila = Record<string, unknown>
const txt = (v: unknown): string | null => (v == null ? null : String(v))
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

/**
 * Las plantillas activas con sus pasos. Dos lecturas y un `Map`, por lo mismo que en la
 * composición: un `embed` que PostgREST no infiere devuelve la plantilla con cero pasos en vez de
 * un error, y una plantilla sin pasos genera una actividad por frente sin que nada avise.
 */
export async function getPlantillas(supabase: SupabaseClient): Promise<ServiceResult<Plantilla[]>> {
  const { data: plantillas, error: eP } = await supabase
    .from('plantilla_secuencia').select('id, nombre, descripcion, activa')
    .eq('activa', true).order('nombre', { ascending: true })
  if (eP) return { data: null, error: eP.message }
  const ids = (plantillas ?? []).map((p) => String((p as Fila).id))
  if (ids.length === 0) return { data: [], error: null }

  const { data: pasos, error: ePa } = await supabase
    .from('plantilla_paso')
    .select('plantilla_id, orden, nombre, peso, tiempo_tecnico, dias_tecnicos, depende_del_anterior')
    .in('plantilla_id', ids).order('orden', { ascending: true })
  if (ePa) return { data: null, error: ePa.message }

  return {
    data: (plantillas ?? []).map((x) => {
      const p = x as Fila
      return {
        id: String(p.id),
        nombre: txt(p.nombre) ?? '',
        descripcion: txt(p.descripcion),
        pasos: (pasos ?? [])
          .filter((s) => String((s as Fila).plantilla_id) === String(p.id))
          .map((s) => {
            const r = s as Fila
            return {
              orden: num(r.orden) ?? 0,
              nombre: txt(r.nombre) ?? '',
              peso: num(r.peso) ?? 0,
              tiempo_tecnico: r.tiempo_tecnico === true,
              dias_tecnicos: num(r.dias_tecnicos),
              depende_del_anterior: r.depende_del_anterior === true,
            }
          }),
      }
    }),
    error: null,
  }
}

export interface ConversionDeLaPartida {
  partida_id: string
  /** Contenedores `rol_estructura = 'frente'` creados por la conversión. */
  frentes: number
  /** Actividades ejecutables (`tipo = 'tarea'`). Es el número que la conversión prometió. */
  actividades: number
  /** `null` = ninguna de sus actividades tiene HH cargadas. No es 0 HH. */
  hh: number | null
}

/**
 * QUÉ PARTIDAS YA SE CONVIRTIERON — el estado que muestra cada tarjeta de la lista izquierda.
 *
 * Se lee de `obra_actividad`, que es DONDE QUEDÓ EL EFECTO, no de una marca en la partida. Una
 * bandera en `cotizacion_partida` diría «convertida» aunque alguien hubiera borrado las
 * actividades; esto cuenta lo que existe. Es la misma regla por la que la conversión se niega a
 * correr dos veces: su control también mira `obra_actividad`.
 */
export async function getConversiones(
  supabase: SupabaseClient, partidaIds: readonly string[],
): Promise<ServiceResult<Map<string, ConversionDeLaPartida>>> {
  if (partidaIds.length === 0) return { data: new Map(), error: null }
  const { data, error } = await supabase
    .from('obra_actividad')
    .select('cotizacion_partida_id, tipo, rol_estructura, hh_plan')
    .in('cotizacion_partida_id', partidaIds)
  if (error) return { data: null, error: error.message }

  const mapa = new Map<string, ConversionDeLaPartida>()
  for (const x of data ?? []) {
    const r = x as Fila
    const id = String(r.cotizacion_partida_id)
    const actual = mapa.get(id) ?? { partida_id: id, frentes: 0, actividades: 0, hh: null }
    if (r.rol_estructura === 'frente') actual.frentes += 1
    if (r.tipo === 'tarea') {
      actual.actividades += 1
      const hh = num(r.hh_plan)
      // `hh_plan` en NULL es «sin cargar». Sumarlo como 0 haría que una partida sin análisis
      // publicara «0 HH», que es justo lo que el modelo se cuidó de no decir.
      if (hh !== null) actual.hh = (actual.hh ?? 0) + hh
    }
    mapa.set(id, actual)
  }
  return { data: mapa, error: null }
}

export interface ObraDestino {
  id: string
  nombre: string
  estado: string | null
}

/** Las obras a las que se puede convertir. La conversión escribe adentro de una obra existente. */
export async function getObrasDestino(supabase: SupabaseClient): Promise<ServiceResult<ObraDestino[]>> {
  const { data, error } = await supabase
    .from('obra_canonica').select('id, nombre, estado').order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((x) => {
      const r = x as Fila
      return { id: String(r.id), nombre: txt(r.nombre) ?? String(r.id), estado: txt(r.estado) }
    }),
    error: null,
  }
}
