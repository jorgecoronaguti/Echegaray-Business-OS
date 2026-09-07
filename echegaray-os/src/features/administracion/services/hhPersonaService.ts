// LAS HORAS DE UNA PERSONA — la lectura del bloque HORAS de la ficha.
//
// LA FUENTE ES LA MISMA QUE LA DE LA OBRA: `registros_hh`. No hay un agregado por persona guardado
// en ninguna parte, y no lo va a haber: un total guardado al lado de sus filas es la segunda versión
// del mismo número, y el día que se borre una imputación las dos dejan de coincidir sin avisar.
//
// LO QUE NO SE PUEDE CRUZAR SE DICE. Las 19 filas históricas de `registros_hh` vienen del Sheet de
// JORNALES con el trabajador en TEXTO LIBRE y sin `persona_id`: no aparecen acá porque no se sabe
// de quién son. Adivinarlo por parecido de nombre sería inventar 671 horas con dueño.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImputacionHH, ServiceResult } from '../types'
// LA RUTA RELATIVA CON EXTENSIÓN NO ES UN DESCUIDO: `node --test` no conoce el alias `@/`, y un
// import de VALOR por alias mata la prueba con ERR_MODULE_NOT_FOUND antes de la primera aserción.
// `TipoHora` podría ir por alias —es `import type` y se borra al compilar— pero viaja junto para no
// dejar dos formas de importar lo mismo en la misma línea.
import { esTrabajada, porTipo, type TipoHora } from '../../obras/services/tipoHora.ts'

/** Cuánto suma cada clave, y en cuántas imputaciones. Sirve para HH por obra y HH por actividad. */
export interface TotalHH {
  clave: string
  etiqueta: string
  horas: number
  imputaciones: number
}

export async function getHHDePersona(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<ImputacionHH[]>> {
  const { data, error } = await supabase
    .from('registros_hh')
    .select('id, fecha, fecha_inicio_semana, obra_canonica_id, actividad_id, horas, tipo_hora, ' +
      'notas, fuente_legacy, created_at, creado_por, actualizado_en, actualizado_por, ' +
      'obra_actividad(nombre), obra_canonica(nombre)')
    .eq('persona_id', personaId)
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  type Cruda = Omit<ImputacionHH, 'actividad_nombre' | 'obra_nombre' | 'creado_en' | 'cargo'
    | 'corregido_en' | 'corrigio'> & {
    obra_actividad: { nombre: string } | null
    obra_canonica: { nombre: string } | null
    created_at: string | null
    creado_por: string | null
    actualizado_en: string | null
    actualizado_por: string | null
  }
  const crudas = ((data ?? []) as unknown as Cruda[])
  // EL NOMBRE DE QUIEN CARGÓ SE RESUELVE APARTE, no con un embed. `creado_por` sí tiene FK a
  // `perfiles`, pero `actualizado_por` NO la tiene: pedir los dos embebidos devuelve error de
  // PostgREST y la solapa entera queda vacía. Una consulta por ids sirve a los dos igual.
  const nombres = await nombresDePerfil(supabase, crudas.flatMap(
    (f) => [f.creado_por, f.actualizado_por]))

  return {
    data: crudas.map((f) => ({
      ...f,
      horas: Number(f.horas),
      actividad_nombre: f.obra_actividad?.nombre ?? null,
      obra_nombre: f.obra_canonica?.nombre ?? null,
      creado_en: f.created_at,
      cargo: f.creado_por ? (nombres.get(f.creado_por) ?? null) : null,
      // UNA CORRECCIÓN SÓLO SE DECLARA SI OCURRIÓ. `actualizado_en` tiene `default now()`, así que
      // toda fila nace con un valor igual al de creación: mostrarlo como «corregido» diría que
      // alguien tocó todas las imputaciones del sistema el día que se cargaron.
      corregido_en: seCorrigio(f.created_at, f.actualizado_en) ? f.actualizado_en : null,
      corrigio: seCorrigio(f.created_at, f.actualizado_en) && f.actualizado_por
        ? (nombres.get(f.actualizado_por) ?? null)
        : null,
    })),
    error: null,
  }
}

/** Un segundo de margen: `created_at` y `actualizado_en` son dos `now()` del mismo INSERT y pueden
 *  diferir en microsegundos. Sin el margen, cada fila nacería declarándose corregida. */
export function seCorrigio(creado: string | null, actualizado: string | null): boolean {
  if (!creado || !actualizado) return false
  const a = new Date(creado).getTime()
  const b = new Date(actualizado).getTime()
  return Number.isFinite(a) && Number.isFinite(b) && b - a > 1000
}

async function nombresDePerfil(
  supabase: SupabaseClient, ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  const m = new Map<string, string>()
  if (unicos.length === 0) return m
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', unicos)
  for (const p of (data ?? []) as { id: string; nombre: string | null }[]) {
    if (p.nombre) m.set(p.id, p.nombre)
  }
  return m
}

/** Las horas TRABAJADAS del período pedido. `desde`/`hasta` en ISO, ambas inclusive.
 *
 *  Una ausencia tiene horas y no es trabajo: sumarla al total diría que la persona trabajó el día
 *  que faltó. Se cuenta aparte, en `resumenDelPeriodo`. */
export function horasEntre(filas: ImputacionHH[], desde: string, hasta: string): number {
  return filas
    .filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta && esTrabajada(f.tipo_hora))
    .reduce((s, f) => s + f.horas, 0)
}

/** Lo que hay que poder contestar de un período SIN abrir una planilla: cuánto trabajó, de qué
 *  clase fue cada hora, y en qué obras. Es el input del futuro módulo de liquidación — y por eso
 *  sale de las MISMAS filas que la obra, no de un total guardado en otro lado. */
export interface ResumenPeriodo {
  trabajadas: number
  porTipo: Record<TipoHora, number>
  obras: TotalHH[]
  actividades: TotalHH[]
  registros: ImputacionHH[]
}

export function resumenDelPeriodo(filas: ImputacionHH[], desde: string, hasta: string): ResumenPeriodo {
  const enVentana = filas.filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta)
  const trabajadas = enVentana.filter((f) => esTrabajada(f.tipo_hora))
  return {
    trabajadas: trabajadas.reduce((s, f) => s + f.horas, 0),
    porTipo: porTipo(enVentana),
    obras: porObra(trabajadas),
    actividades: porActividad(trabajadas),
    registros: enVentana,
  }
}

/** Agrupa por una clave, ordenado de más horas a menos. Las filas sin clave se agrupan aparte con
 *  la etiqueta que reciba: «sin obra» y «sin actividad» son respuestas, no huecos. */
export function agrupar(
  filas: ImputacionHH[],
  clave: (f: ImputacionHH) => string | null,
  etiqueta: (f: ImputacionHH) => string | null,
  sinClave: string,
): TotalHH[] {
  const m = new Map<string, TotalHH>()
  for (const f of filas) {
    const k = clave(f) ?? '—'
    const previo = m.get(k)
    if (previo) {
      previo.horas += f.horas
      previo.imputaciones += 1
    } else {
      m.set(k, { clave: k, etiqueta: etiqueta(f) ?? sinClave, horas: f.horas, imputaciones: 1 })
    }
  }
  return [...m.values()].sort((a, b) => b.horas - a.horas)
}

export const porObra = (filas: ImputacionHH[]): TotalHH[] =>
  // Se agrupa por el ID y se rotula con el NOMBRE: agrupar por nombre fusionaría dos obras que se
  // llaman parecido, y rotular con el id le muestra un uuid a una persona.
  // El nombre se usa SÓLO si hay obra: una fila sin obra con un nombre colgado de antes se
  // rotularía con esa obra y diría que trabajó donde no trabajó.
  agrupar(filas, (f) => f.obra_canonica_id, (f) => (f.obra_canonica_id ? f.obra_nombre : null), 'sin obra')

export const porActividad = (filas: ImputacionHH[]): TotalHH[] =>
  agrupar(filas, (f) => f.actividad_id, (f) => f.actividad_nombre, 'sin actividad')
