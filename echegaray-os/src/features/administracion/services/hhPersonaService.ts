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
    .select('id, fecha, fecha_inicio_semana, obra_canonica_id, actividad_id, horas, notas, ' +
      'fuente_legacy, obra_actividad(nombre)')
    .eq('persona_id', personaId)
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  type Cruda = Omit<ImputacionHH, 'actividad_nombre'> & { obra_actividad: { nombre: string } | null }
  return {
    data: ((data ?? []) as unknown as Cruda[]).map((f) => ({
      ...f,
      horas: Number(f.horas),
      actividad_nombre: f.obra_actividad?.nombre ?? null,
    })),
    error: null,
  }
}

/** Las horas del período pedido. `desde`/`hasta` en ISO, ambas inclusive. */
export function horasEntre(filas: ImputacionHH[], desde: string, hasta: string): number {
  return filas
    .filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta)
    .reduce((s, f) => s + f.horas, 0)
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
  agrupar(filas, (f) => f.obra_canonica_id, (f) => f.obra_canonica_id, 'sin obra')

export const porActividad = (filas: ImputacionHH[]): TotalHH[] =>
  agrupar(filas, (f) => f.actividad_id, (f) => f.actividad_nombre, 'sin actividad')
