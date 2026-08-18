// EL GANTT GLOBAL — todas las actividades de todas las obras, agrupadas por obra.
//
// ═══ LA MISMA FUENTE Y EL MISMO COMPONENTE QUE EL GANTT DE LA OBRA ═══
//
// El dueño (19/08), textual: *"El Gantt global y el Gantt de una obra deben consumir exactamente
// las mismas actividades canónicas"*. Acá se cumple de la única manera que se puede verificar:
//
//   · la fuente es `getActividades(supabase)` — la MISMA función que usa la ficha, sin el `where`;
//   · el componente es `<Gantt>` — el MISMO, con el eje de agrupación cambiado a obra;
//   · el recorte de archivadas es `sinArchivar()` — la MISMA función, no un filtro escrito de nuevo.
//
// Lo único propio de esta pantalla es qué obras se ven, y eso no lo decide este archivo: lo decide
// el RLS de `obra_actividad` (`public.ve_obra(obra_id)`). Un jefe de obra abre esta URL y ve el
// cronograma de SUS obras, sin que haya un solo `if` acá que lo decida.
//
// LAS PRECEDENCIAS SE TRAEN IGUAL QUE EN LA FICHA. Hoy la tabla está vacía en todas las obras y por
// eso no se dibuja una sola flecha: es el estado real del dato, no una función que falte.

import { createClient } from '@/lib/supabase/server'
import { getActividades, getDependencias, getRestricciones } from '@/features/obras/services/obrasService'
import { sinArchivar } from '@/features/obras/services/cronograma'
import { getContextoGlobal } from '@/features/obras/services/vistaGlobal'
import { Gantt } from '@/features/obras/components/Gantt'
import { FiltroObra, NavObras } from '@/features/obras/components/NavObras'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function CronogramaGlobalPage() {
  const supabase = await createClient()
  const ctx = await getContextoGlobal(supabase)
  const [actividades, restricciones, dependencias] = await Promise.all([
    getActividades(supabase),
    getRestricciones(supabase),
    getDependencias(supabase),
  ])

  const acts = sinArchivar(actividades.data ?? [])
  // Los nombres de TODAS las obras conocidas, también las archivadas: una barra suya sigue teniendo
  // que decir de qué obra es. El filtro de arriba, en cambio, ofrece sólo la cartera viva.
  const obras = [...ctx.nombreDeObra].map(([id, nombre]) => ({ id, nombre }))
  const conCronograma = new Set(acts.map((a) => a.obra_id)).size

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Cronograma"
      subtitle={`${acts.length} actividades planificadas en ${conCronograma} obra${conCronograma === 1 ? '' : 's'}. Es el mismo plan que se edita adentro de cada obra: acá se lee, no se toca.`}
    >
      <NavObras />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <FiltroObra obras={ctx.obras} vista="cronograma" />
      </div>

      {actividades.error && <Callout tono="neg">No pude leer las actividades: {actividades.error}</Callout>}

      {!actividades.error && acts.length === 0 && (
        <Callout tono="info">Ninguna de las obras visibles tiene actividades cargadas.</Callout>
      )}

      {acts.length > 0 && (
        // SIN `acciones`: esta pantalla no edita. Editar una fecha se hace en la obra, que es donde
        // están su línea base, sus impedimentos y su permiso de escritura. Un segundo lugar para
        // escribir la misma fecha es un segundo lugar donde validarla y donde olvidarse de hacerlo.
        <Gantt
          actividades={acts}
          restricciones={restricciones.data ?? []}
          dependencias={dependencias.data ?? []}
          obras={obras}
        />
      )}
    </PageShell>
  )
}
