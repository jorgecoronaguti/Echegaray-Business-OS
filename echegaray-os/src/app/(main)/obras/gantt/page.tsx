// GANTT DE CARTERA — LA CARTERA EN UN RENGLÓN POR OBRA.
//
// El dueño, textual: *"GANTT GLOBAL = obras. GANTT OBRA = actividades. No son dos sistemas: el
// global agrega la información de las actividades canónicas por `obra_id`. No duplicar datos."*
//
// ═══ DÓNDE SE HACE LA AGREGACIÓN, Y POR QUÉ NO ACÁ ═══
//
// En `obra_plan_vs_real`, la vista que ya publica `min(inicio_plan)` / `max(fin_plan)` /
// `min(inicio_base)` / `max(fin_base)` por obra sobre `obra_actividad`, y que es la misma que
// alimenta las columnas de plazo de la cartera y el bloque «Plan contra real» de cada obra. No hay
// columna nueva, no hay tabla nueva y no hay una segunda suma escrita en TypeScript: el fin de obra
// que se ve acá es literalmente el mismo número que la ficha usa para decir si la obra se atrasó.
//
// ═══ ESTA PANTALLA NO HABLA DE PLATA ═══
//
// La lectura pide las columnas de plazo una por una (`COLUMNAS_PLAZO`). Contrato, presupuesto y
// márgenes no se piden — ni siquiera enmascarados. Un Gantt es una pregunta sobre el tiempo, y el
// handoff lo dice con todas las letras (`design/screens/obras.md` §1h).

import { createClient } from '@/lib/supabase/server'
import { filasDeObras, getPlazoPorObra } from '@/features/obras/services/ganttObras'
import { esCampo, type Direccion } from '@/features/obras/services/ordenObras'
import { OrdenGantt } from '@/features/obras/components/OrdenGantt'
import { filtrar, filtroDesde } from '@/features/obras/services/filtroObras'
import { FiltrosObras } from '@/features/obras/components/FiltrosObras'
import { GanttObras } from '@/features/obras/components/GanttObras'
import { NavObras } from '@/features/obras/components/NavObras'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function GanttGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string; dir?: string; archivadas?: string; etapa?: string; q?: string }>
}) {
  const sp = await searchParams
  const { orden: ordenPedido, dir: dirPedida, archivadas: verArchivadas } = sp
  const filtro = filtroDesde(sp)
  const orden = esCampo(ordenPedido) ? ordenPedido : null
  const dir: Direccion = dirPedida === 'asc' ? 'asc' : 'desc'
  const supabase = await createClient()
  const { data, error } = await getPlazoPorObra(supabase)

  // EL DÍA SE FIJA EN EL SERVIDOR Y VIAJA. Calcularlo en el cliente para decidir «vencida» y en el
  // servidor para ordenar daría dos verdades distintas alrededor de la medianoche.
  const hoyIso = new Date().toISOString().slice(0, 10)
  // EL FILTRO SE APLICA SOBRE LA CARTERA, ANTES DE ARMAR LAS BARRAS: el lienzo del Gantt se estira
  // al rango de lo que muestra, así que filtrar después dejaría un calendario de obras que ya no
  // están en pantalla.
  const cartera = filtrar(data ?? [], filtro)
  const filas = filasDeObras(cartera, hoyIso, verArchivadas === '1', orden, dir)
  const visiblesSinFiltrar = filasDeObras(data ?? [], hoyIso, verArchivadas === '1', null, dir).length
  const conPlan = filas.filter((f) => f.barra).length
  const archivadas = (data ?? []).filter((o) => o.estado === 'cerrada').length

  return (
    <PageShell
      title="Gantt"
      subtitle={
        `${filas.length} obra${filas.length === 1 ? '' : 's'} en la cartera, ${conPlan} con fechas de plan. `
        + `Cada barra va del inicio al fin de la obra, agregados de sus actividades. Tocar una abre su cronograma.`
        + (archivadas && verArchivadas !== '1'
            ? ` ${archivadas} archivada${archivadas === 1 ? '' : 's'} queda${archivadas === 1 ? '' : 'n'} afuera.`
            : '')
      }
    >
      {/* GUARDA CÓMO QUEDÓ ESTA VISTA. Es lo único que corre en el navegador de esta pantalla, y
          está acá y no en el middleware porque una precarga de Next no monta nada: sólo se guarda
          lo que alguien está mirando de verdad. Ver `components/RecordarVista.tsx`. */}
      <RecordarVista />
      <NavObras />

      {/* La tira va DEBAJO de la navegación y ARRIBA del lienzo: es una decisión sobre lo que se está
          por leer, no una acción de la pantalla. */}
      {!error && visiblesSinFiltrar > 1 && (
        <FiltrosObras filtro={filtro} base="/obras/gantt" resultados={filas.length} total={visiblesSinFiltrar}
          extra={{ archivadas: verArchivadas === '1' ? '1' : undefined, orden: orden ?? undefined, dir: orden ? dir : undefined }} />
      )}

      {!error && filas.length > 1 && <OrdenGantt activo={orden} dir={dir} archivadas={verArchivadas === '1'}
        etapa={filtro.etapa ?? undefined} q={filtro.q || undefined} />}

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
