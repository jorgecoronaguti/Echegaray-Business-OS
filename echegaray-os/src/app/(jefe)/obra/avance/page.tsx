import { Aviso } from '@/shared/components/ds'
import { Encabezado, Panel, Rotulo } from '@/features/jefe/components/Piezas'
import { ComoVieneLaObra } from '@/features/jefe/components/ComoVieneLaObra'
import { FormularioAvance } from '@/features/jefe/components/FormularioAvance'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import {
  getActividad, getActividades, getArbol, getDependencias, getImpedimentos, getPasos,
} from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import {
  avanceEsperado, avancePorFrente, causasDeAtraso, finProyectado, hhDeLaObra,
} from '@/features/jefe/services/progreso'
import { soloTareas } from '@/features/jefe/services/dia'
import { getEsperados } from '@/features/administracion/services/presenciaService'
import { registrarAvance } from '@/features/jefe/services/actionsAvance'
import type { ObraDelJefe } from '@/features/jefe/services/jefeService'
import type { SupabaseClient } from '@supabase/supabase-js'

// UNA RUTA, DOS PANTALLAS DEL CONTRATO — y no es un atajo.
//
//   `/obra/avance`                  J03 · Cómo viene la obra. Es un contexto de la barra de abajo.
//   `/obra/avance?actividad=<id>`   Registrar el avance de UNA tarea. Se abre desde Tareas.
//
// Antes, entrar sin tarea mostraba «elegí primero una tarea»: una pantalla entera para decir que no
// había nada. El canónico J01 pone «Avance» en la barra y J03 es lo que abre, así que ese hueco pasó
// a ser la pantalla que faltaba. Los enlaces con `?actividad=` que ya circulan siguen valiendo.
//
// ═══ LA RELACIÓN CON OTRAS TAREAS VIENE ESCRITA DE LA BASE ═══
//
// `obra_dependencia_legible` redacta la frase («empieza cuando termina el encadenado»). Acá se
// imprime tal cual. Armarla en el front haría que el teléfono, el escritorio y el chat inventaran
// cada uno la suya, y tres redacciones de la misma dependencia es cómo se llega a que dos personas
// entiendan cosas distintas del mismo plan.

export const dynamic = 'force-dynamic'

type Estado = { ok: boolean; mensaje: string } | null

export default async function JefeAvancePage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; actividad?: string }>
}) {
  const { obra: pedida, actividad: actividadId } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  if (!actividadId) return <PantallaDeObra supabase={supabase} obra={obra} error={error} />

  const [actividad, pasos, dependencias, plantel, arbol] = await Promise.all([
    getActividad(supabase, actividadId),
    getPasos(supabase, actividadId),
    getDependencias(supabase, actividadId),
    getEsperados(supabase, obra.id),
    getArbol(supabase, obra.id),
  ])

  if (actividad.error || !actividad.data) {
    return (
      <div className="px-4 py-6">
        <Aviso tono="neg" titulo="No pude abrir esa tarea." testid="jefe-avance-error">
          {actividad.error ?? 'No existe, o no es de una obra tuya.'}
        </Aviso>
      </div>
    )
  }

  const a = actividad.data
  if (a.tipo === 'resumen') {
    return (
      <div className="px-4 py-6">
        <Aviso tono="warn" titulo={`«${a.nombre}» agrupa otras tareas.`} testid="jefe-avance-contenedor">
          Un frente no se mide: se completa con las tareas que agrupa. Cargá el avance en cada una de
          ellas y el frente se mueve solo.
        </Aviso>
      </div>
    )
  }

  const guardar = async (_estado: Estado, form: FormData): Promise<Estado> => {
    'use server'
    const r = await registrarAvance(obra.id, form)
    return r.ok ? { ok: true, mensaje: r.mensaje ?? 'Avance guardado' } : { ok: false, mensaje: r.error }
  }

  return (
    <>
      {dependencias.data && dependencias.data.length > 0 && (
        <div className="px-4 pt-4">
          <Rotulo tono="warn">DEPENDE DE</Rotulo>
          <Panel testid="dependencias">
            {dependencias.data.map((d) => (
              <p key={d.id} className="px-[18px] py-3 text-[13px] leading-relaxed text-ink">
                {d.relacion}
              </p>
            ))}
          </Panel>
        </div>
      )}
      <FormularioAvance
        actividad={a}
        frente={frentePorTarea(arbol.data ?? []).get(a.actividad_id)?.nombre ?? null}
        pasos={pasos.data ?? []}
        plantel={plantel.data ?? []}
        fecha={hoyEnObra()}
        accion={guardar}
      />
    </>
  )
}

/** J03 · CÓMO VIENE LA OBRA. Las lecturas son las mismas que ya usan J01 y J06. */
async function PantallaDeObra({
  supabase, obra, error,
}: {
  supabase: SupabaseClient
  obra: ObraDelJefe
  error: string | null
}) {
  const hoy = hoyEnObra()
  const [actividades, arbol, impedimentos] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
    getImpedimentos(supabase, obra.id),
  ])
  const tareas = soloTareas(actividades.data ?? [])
  const primerError = error ?? actividades.error ?? arbol.error ?? impedimentos.error ?? null

  return (
    <>
      <Encabezado titulo="Cómo viene la obra" sub={obra.nombre} />
      {primerError && (
        <div className="px-4 pb-3">
          <Aviso tono="neg" titulo="No se pudo leer todo el avance." testid="jefe-avance-obra-error">
            {primerError}
          </Aviso>
        </div>
      )}
      <ComoVieneLaObra
        real={obra.avance_pct}
        esperado={avanceEsperado(tareas, hoy)}
        hh={hhDeLaObra(tareas)}
        fin={finProyectado(tareas, obra.fecha_fin_plan)}
        frentes={avancePorFrente(actividades.data ?? [], frentePorTarea(arbol.data ?? []), hoy)}
        causas={causasDeAtraso(impedimentos.data ?? [], hoy)}
        hoy={hoy}
      />
    </>
  )
}
