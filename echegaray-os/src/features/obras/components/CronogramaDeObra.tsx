// ═══ 05 · OBRA · TRABAJO · CRONOGRAMA (y M07, C06, MC7) — diseño ERP Obras, 23/09/2026 ═══
//
// ES UN SERVER COMPONENT A PROPÓSITO: la página lo monta con las actividades y los días hábiles de
// la obra, y acá se leen las DOS cosas que el diseño nuevo dibuja y la página no conoce —las
// dependencias (los conectores) y el calendario de no laborables (las columnas del editor)—. La
// pantalla vive en `TabCronograma`, que tiene la escala, la selección y el editor en la mano.
//
// UN SOLO CRONOGRAMA: la vista (05) y el editor (C06, `&editar=1`) son la misma pantalla con las
// mismas filas. La franja de cifras y las capas encendibles de la versión anterior no están en el
// diseño y se retiraron.

import { createClient } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad } from '../types'
import { getDependencias } from '../services/obrasService'
import { guardarFechasPlan } from '../services/actionsEjecucion'
import { TabCronograma } from './TabCronograma'

export interface Props {
  obraId: string
  /** El cronograma vivo: las actividades NO archivadas, en el orden del tracker. */
  actividades: Actividad[]
  /** Los días que ESTA obra trabaja (isodow). Vacío = lunes a viernes, el default de `obra_canonica`. */
  diasHabiles?: readonly number[]
  /** Sellar la línea base de toda la obra. Sin acción, el control no se ofrece. */
  sellar?: () => Promise<ResultadoAccion>
  archivadas?: Actividad[]
  restaurar?: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  actividadAbierta?: string | null
  /** Sólo para fijar el día en un test. En la pantalla es hoy. */
  hoy?: string
}

export async function CronogramaDeObra({ obraId, actividades, diasHabiles = [], sellar, actividadAbierta = null, hoy }: Props) {
  const supabase = await createClient()
  const [deps, feriados] = await Promise.all([
    getDependencias(supabase, obraId),
    supabase.from('calendario_no_laborable').select('fecha').or(`obra_id.is.null,obra_id.eq.${obraId}`).limit(2000),
  ])
  return (
    <TabCronograma
      obraId={obraId}
      actividades={actividades}
      dependencias={(deps.data ?? []).map((d) => ({ origen_id: d.origen_id, destino_id: d.destino_id }))}
      isodows={[...diasHabiles]}
      feriados={((feriados.data ?? []) as { fecha: string }[]).map((f) => f.fecha)}
      actividadAbierta={actividadAbierta}
      hoy={hoy ?? new Date().toISOString().slice(0, 10)}
      guardarFechas={guardarFechasPlan.bind(null, obraId)}
      {...(sellar ? { sellar } : {})}
      fallas={[deps.error, feriados.error?.message].filter((e): e is string => Boolean(e))}
    />
  )
}
