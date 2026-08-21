import { Aviso } from '@/shared/components/ds'
import { Encabezado, Nada, Panel, Rotulo } from '@/features/jefe/components/Piezas'
import { FormularioAvance } from '@/features/jefe/components/FormularioAvance'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividad, getArbol, getDependencias, getPasos } from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import { getEsperados } from '@/features/administracion/services/presenciaService'
import { registrarAvance } from '@/features/jefe/services/actionsAvance'

// J03 · REGISTRAR AVANCE — una tarea, el número que la mueve, y quién lo hizo.
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

  if (!actividadId) {
    return (
      <>
        <Encabezado titulo="Registrar avance" sub={obra.nombre} />
        <div className="px-4 pb-6">
          <Panel>
            <Nada>
              Elegí primero la tarea desde Tareas. El avance se carga contra una tarea concreta: sin
              eso no hay nada que medir.
            </Nada>
          </Panel>
        </div>
      </>
    )
  }

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
