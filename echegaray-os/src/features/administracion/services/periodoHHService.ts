// LOS PERÍODOS DE HH — la lectura.
//
// Todo sale de `periodo_hh_panel` (migración `20260821T5800`): los meses, sus agregados y su estado
// en una sola fila. Los totales NO se suman acá: son el mismo mes que el trigger bloquea y que
// `cerrar_periodo_hh()` sella, y tres definiciones de «las HH de agosto» terminan en tres números
// distintos — que es exactamente lo que este módulo existe para no volver a tener.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'

export const MIGRACION = '20260821T5800_el_periodo_de_hh_se_cierra'

export type EstadoPeriodo = 'abierto' | 'cerrado'

export interface PeriodoHH {
  /** Primer día del mes, `YYYY-MM-01`. Es la clave del período en toda la capacidad. */
  periodo: string
  personas: number
  hh_normales: number
  hh_extras: number
  correcciones: number
  /** Las que BLOQUEAN el cierre. Se publican aparte para que la pantalla pueda explicar por qué el
   *  botón no va a funcionar, en vez de dejar que rebote. */
  correcciones_pendientes: number
  estado: EstadoPeriodo
  cerrado_en: string | null
}

/** `42P01` y el error de caché de esquema de PostgREST significan lo mismo: la migración no está
 *  aplicada. Se dice con el NOMBRE del archivo — una tabla vacía se leería como «no hay períodos». */
function faltaLaTabla(error: { code?: string; message: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /relation .* does not exist|could not find the table|schema cache/i.test(error.message)
}

export async function getPeriodos(
  supabase: SupabaseClient, limite = 18,
): Promise<ServiceResult<PeriodoHH[]>> {
  const { data, error } = await supabase
    .from('periodo_hh_panel').select('*')
    .order('periodo', { ascending: false })
    .limit(limite)

  if (error) {
    if (faltaLaTabla(error)) {
      return {
        data: null,
        error: `Todavía no puedo mostrar los períodos de HH: falta aplicar en la base la migración ${MIGRACION}.`,
      }
    }
    return { data: null, error: error.message }
  }

  // `numeric` de Postgres llega como TEXTO por PostgREST. Sin este Number, «412» ordenaría antes que
  // «8.842» y el total de la pantalla sería una concatenación.
  return {
    data: (data ?? []).map((p) => {
      const f = p as Record<string, unknown>
      return {
        periodo: String(f.periodo).slice(0, 10),
        personas: Number(f.personas ?? 0),
        hh_normales: Number(f.hh_normales ?? 0),
        hh_extras: Number(f.hh_extras ?? 0),
        correcciones: Number(f.correcciones ?? 0),
        correcciones_pendientes: Number(f.correcciones_pendientes ?? 0),
        estado: f.estado === 'cerrado' ? 'cerrado' : 'abierto',
        cerrado_en: (f.cerrado_en as string | null) ?? null,
      }
    }),
    error: null,
  }
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** `2026-08-01` → `Agosto 2026`. Con el año siempre: una tabla de dieciocho meses sin año hace que
 *  «Agosto» aparezca dos veces y nadie sepa cuál es cuál. */
export function rotuloPeriodo(periodo: string): string {
  const mes = MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo.slice(5, 7)
  return `${mes} ${periodo.slice(0, 4)}`
}

/** El mes al que pertenece un día, en la clave del período. */
export function periodoDe(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`
}
