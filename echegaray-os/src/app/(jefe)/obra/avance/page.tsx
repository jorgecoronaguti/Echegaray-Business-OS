import { AvisoError, TopBarDetalle, Vacio } from '@/shared/components/movil/Piezas'
import { ComoVieneLaObra } from '@/features/jefe/components/ComoVieneLaObra'
import { FormularioAvance } from '@/features/jefe/components/FormularioAvance'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import {
  getActividad, getActividades, getArbol, getImpedimentos, getPasos, getUltimosPartes,
} from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import {
  avanceEsperado, avancePorFrente, causasDeAtraso, finProyectado, hhDeLaObra,
} from '@/features/jefe/services/progreso'
import { soloTareas } from '@/features/jefe/services/dia'
import { getEsperados } from '@/features/administracion/services/presenciaService'
import { registrarAvance } from '@/features/jefe/services/actionsAvance'
import { conObra } from '@/features/jefe/services/navegacion'
import { semanaISO } from '@/features/jefe/services/tarea'
import type { ObraDelJefe } from '@/features/jefe/services/jefeService'
import type { SupabaseClient } from '@supabase/supabase-js'

// UNA RUTA, DOS PANTALLAS DEL CONTRATO — y no es un atajo.
//
//   `/obra/avance`                  J03 · Cómo viene la obra. Es un contexto de la barra de abajo.
//   `/obra/avance?actividad=<id>`   J06 · el detalle de UNA tarea, con sus pasos y su guardado.
//
// El mockup J06 titula «Columna de encadenado H17 / Eje 5–8 · Cuadrilla 2»: lo que dibuja es una
// ACTIVIDAD, no un contenedor del árbol. Por eso J06 se porta acá y no en `/obra/frente`, que
// agrupa tareas y no tiene pasos que marcar.
//
// ═══ LA RELACIÓN CON OTRAS TAREAS VIENE ESCRITA DE LA BASE ═══
//
// `obra_dependencia_legible` redacta la frase («empieza cuando termina el encadenado»). Armarla en
// el front haría que el teléfono, el escritorio y el chat inventaran cada uno la suya. No se dibuja
// en J06 —el mockup no la tiene— y por eso ya no se lee: pedirla para no mostrarla era una consulta
// por pantalla sin destino.

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

  const [actividad, pasos, plantel, arbol, partes, impedimentos] = await Promise.all([
    getActividad(supabase, actividadId),
    getPasos(supabase, actividadId),
    getEsperados(supabase, obra.id),
    getArbol(supabase, obra.id),
    getUltimosPartes(supabase, actividadId),
    getImpedimentos(supabase, obra.id),
  ])

  const volver = { href: conObra('/obra/tareas', obra.id), label: 'Tareas' }

  if (actividad.error || !actividad.data) {
    return (
      <>
        <TopBarDetalle volver={volver} testidVolver="volver-jefe" titulo="Tarea" sub={obra.nombre} />
        <div style={{ padding: '16px 16px 24px' }}>
          <AvisoError testid="jefe-avance-error">
            {actividad.error ?? 'No existe, o no es de una obra tuya.'}
          </AvisoError>
        </div>
      </>
    )
  }

  const a = actividad.data
  const frente = frentePorTarea(arbol.data ?? []).get(a.actividad_id)?.nombre ?? null

  if (a.tipo === 'resumen') {
    return (
      <>
        <TopBarDetalle volver={volver} testidVolver="volver-jefe" titulo={a.nombre} sub={frente ?? obra.nombre} />
        <div style={{ padding: '16px 16px 24px' }}>
          <Vacio testid="jefe-avance-contenedor">
            «{a.nombre}» agrupa otras tareas. Un frente no se mide: se completa con las tareas que
            agrupa. Cargá el avance en cada una y el frente se mueve solo.
          </Vacio>
        </div>
      </>
    )
  }

  const guardar = async (_estado: Estado, form: FormData): Promise<Estado> => {
    'use server'
    const r = await registrarAvance(obra.id, form)
    return r.ok ? { ok: true, mensaje: r.mensaje ?? 'Avance guardado' } : { ok: false, mensaje: r.error }
  }

  const suyos = (impedimentos.data ?? []).filter((i) => i.actividad_id === a.actividad_id)

  return (
    <>
      <TopBarDetalle
        volver={volver}
        testidVolver="volver-jefe"
        titulo={a.nombre}
        sub={[frente, a.cuadrilla_prevista ?? 'sin cuadrilla'].filter(Boolean).join(' · ')}
      />
      <FormularioAvance
        actividad={a}
        frente={frente}
        pasos={pasos.data ?? []}
        plantel={plantel.data ?? []}
        fecha={hoyEnObra()}
        partes={partes.data ?? []}
        impedimentos={suyos}
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
      <TopBarDetalle titulo="Cómo viene la obra" sub={`${obra.nombre} · semana ${semanaISO(hoy)}`} />
      {primerError && (
        <div style={{ padding: '16px 16px 0' }}>
          <AvisoError testid="jefe-avance-obra-error">{primerError}</AvisoError>
        </div>
      )}
      <ComoVieneLaObra
        real={obra.avance_pct}
        esperado={avanceEsperado(tareas, hoy)}
        hh={hhDeLaObra(tareas)}
        fin={finProyectado(tareas, obra.fecha_fin_plan)}
        frentes={avancePorFrente(actividades.data ?? [], frentePorTarea(arbol.data ?? []), hoy)}
        causas={causasDeAtraso(impedimentos.data ?? [], hoy)}
      />
    </>
  )
}
