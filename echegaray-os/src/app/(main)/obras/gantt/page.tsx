// GANTT GLOBAL — LA CARTERA EN UN RENGLÓN POR OBRA.
//
// El dueño, textual: *"GANTT GLOBAL = obras. GANTT OBRA = actividades. No son dos sistemas: el
// global agrega la información de las actividades canónicas por `obra_id`. No duplicar datos."*
//
// ═══ DÓNDE SE HACE LA AGREGACIÓN, Y POR QUÉ NO ACÁ ═══
//
// En `obra_plan_vs_real`, la vista que ya publica `min(inicio_plan)` / `max(fin_plan)` /
// `min(inicio_base)` / `max(fin_base)` por obra sobre `obra_actividad`, y que es la misma que
// alimenta las columnas de plazo del portafolio y el bloque «Plan contra real» de cada obra. No hay
// columna nueva, no hay tabla nueva y no hay una segunda suma escrita en TypeScript: el fin de obra
// que se ve acá es literalmente el mismo número que la ficha usa para decir si la obra se atrasó.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// La lectura pide las columnas de plazo una por una (`COLUMNAS_PLAZO`). Contrato, presupuesto y
// márgenes no se piden — ni siquiera enmascarados. Un Gantt es una pregunta sobre el tiempo.

import { createClient } from '@/lib/supabase/server'
import { filasDeObras, getPlazoPorObra } from '@/features/obras/services/ganttObras'
import { GanttObras } from '@/features/obras/components/GanttObras'
import { NavObras } from '@/features/obras/components/NavObras'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function GanttGlobalPage() {
  const supabase = await createClient()
  const { data, error } = await getPlazoPorObra(supabase)

  // EL DÍA SE FIJA EN EL SERVIDOR Y VIAJA. Calcularlo en el cliente para decidir «vencida» y en el
  // servidor para ordenar daría dos verdades distintas alrededor de la medianoche.
  const hoyIso = new Date().toISOString().slice(0, 10)
  const filas = filasDeObras(data ?? [], hoyIso)
  const conPlan = filas.filter((f) => f.barra).length
  const archivadas = (data ?? []).filter((o) => o.estado === 'cerrada').length

  return (
    <PageShell
      title="Gantt"
      subtitle={
        `${filas.length} obra${filas.length === 1 ? '' : 's'} en la cartera, ${conPlan} con fechas de plan. `
        + `Cada barra va del inicio al fin de la obra, agregados de sus actividades. Tocar una abre su cronograma.`
        + (archivadas ? ` ${archivadas} archivada${archivadas === 1 ? '' : 's'} queda${archivadas === 1 ? '' : 'n'} afuera.` : '')
      }
    >
      <NavObras />

      {/* SIN DESPLEGABLE PARA ELEGIR OBRA. Existía cuando la vista global desplegaba 344 actividades
          y hacía falta una forma de saltar a una. Ahora cada renglón ES una obra y se toca: un
          selector que hace lo mismo que la fila de al lado es chrome que hay que aprender dos veces.
          `FiltroObra` se retiró junto con las cuatro vistas globales que lo usaban. */}
      {error && <Callout tono="neg">No pude leer el plazo de las obras: {error}</Callout>}

      {!error && filas.length === 0 && (
        <Callout tono="info">No hay ninguna obra visible en tu cartera.</Callout>
      )}

      {filas.length > 0 && <GanttObras filas={filas} hoyIso={hoyIso} />}
    </PageShell>
  )
}
