// LO QUE HAY CARGADO HOY, EN TODAS LAS OBRAS A LA VEZ.
//
// `getJornadaDelDia` lee UNA obra porque es la pantalla de carga del jefe. «En obra ahora» mira la
// empresa entera, así que hace falta la misma lectura sin el filtro de obra. La REGLA no se
// duplica: qué significa cada fila lo decide `asistenciaDelDia.ts` y qué hora es trabajo lo decide
// `tipoHora.ts`. Acá sólo se traen filas.
//
// Quién ve qué tampoco se decide acá: `registros_hh` y `obra_canonica` tienen RLS por `ve_obra()`,
// así que un jefe de obra recibe lo suyo y Administración todo. Repetirlo en TypeScript sería una
// segunda definición del alcance que además no protege una llamada directa a PostgREST.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { RegistroDelDia } from './asistenciaDelDia'

const COLUMNAS = 'persona_id, horas, tipo_hora, notas, obra_canonica_id,'
  + ' obra_canonica(nombre), personas(nombre_completo, categoria)'

interface FilaCruda {
  persona_id: string
  horas: number | string
  tipo_hora: string
  notas: string | null
  obra_canonica_id: string | null
  obra_canonica: { nombre: string } | null
  personas: { nombre_completo: string | null; categoria: string | null } | null
}

/** Los registros de horas de un día. `horas` es numeric: llega como TEXTO y se convierte acá, o
 *  una suma de dos filas daría «88» en vez de 16. */
export async function getRegistrosDelDia(
  supabase: SupabaseClient, fecha: string, obraId?: string | null,
): Promise<ServiceResult<RegistroDelDia[]>> {
  let consulta = supabase.from('registros_hh').select(COLUMNAS)
    .eq('fecha', fecha).not('persona_id', 'is', null)
  if (obraId) consulta = consulta.eq('obra_canonica_id', obraId)
  const { data, error } = await consulta
  if (error) return { data: null, error: error.message }
  return {
    data: ((data ?? []) as unknown as FilaCruda[]).map((f) => ({
      persona_id: f.persona_id,
      nombre: f.personas?.nombre_completo ?? null,
      categoria: f.personas?.categoria ?? null,
      obra_id: f.obra_canonica_id,
      obra: f.obra_canonica?.nombre ?? null,
      horas: Number(f.horas),
      tipo_hora: f.tipo_hora,
      notas: f.notas,
    })),
    error: null,
  }
}
