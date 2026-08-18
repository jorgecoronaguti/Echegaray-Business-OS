import Link from 'next/link'
import type { Actividad, Persona, Restriccion } from '../types'
import type { AccionesCronograma } from './PanelActividad'
import { Gantt } from './Gantt'
import { TabPlanificacion } from './TabPlanificacion'
import { BotonAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'

// EL CRONOGRAMA — DOS VISTAS DE LAS MISMAS ACTIVIDADES.
//
// ═══ POR QUÉ «PLANIFICACIÓN» DEJÓ DE SER UNA SOLAPA (19/08/2026) ═══
//
// El dueño, textual: *"No quiero una pestaña principal adicional llamada Planificación. Integrarla
// dentro de Cronograma como otra vista"* · *"«Próximos trabajos» sale de las MISMAS actividades. No
// duplicar cronograma ni actividades"*.
//
// Y tiene razón por una razón que se ve al usarlo: planificar no es un lugar distinto de donde vive
// el cronograma — es mirar el mismo cronograma con otra ventana de tiempo. Cuando son dos solapas,
// la de la izquierda y la de la derecha muestran las mismas filas y nadie sabe cuál manda.
//
// Acá no hay dos fuentes: `VISTAS` conmuta la PRESENTACIÓN de un único array `actividades`. La
// ventana de «Próximos trabajos» la calcula `lookahead()`, que ya vivía en el service y es la misma
// función que usa el resto del OS.
//
// ═══ LA SUB-VISTA Y LA VENTANA VIAJAN EN LA URL ═══
//
// `?vista=cronograma&sub=proximos&semanas=2` es un link que se manda por chat y abre exactamente lo
// que el otro está mirando. Con estado de cliente, "mirá las próximas dos semanas" obliga a explicar
// dónde hacer clic. Es el mismo criterio con el que se eligieron las solapas de la obra.

const SEMANAS = [
  { v: 1 as const, label: 'Esta semana' },
  { v: 2 as const, label: '2 semanas' },
  { v: 6 as const, label: '6 semanas' },
]

export type SubCronograma = 'gantt' | 'proximos'
export type VentanaSemanas = 1 | 2 | 6

/** La ventana de `lookahead`, calculada acá para que las dos vistas usen la misma definición. */
export function proximas(actividades: Actividad[], semanas: VentanaSemanas, hoy = new Date()): Actividad[] {
  const desde = new Date(hoy); desde.setUTCHours(0, 0, 0, 0)
  const hasta = new Date(desde.getTime() + semanas * 7 * 86400000)
  const d0 = desde.toISOString().slice(0, 10)
  const d1 = hasta.toISOString().slice(0, 10)
  return actividades.filter((a) => {
    if (a.tipo === 'resumen') return false
    const ini = a.inicio_plan
    if (!ini) return false
    const fin = a.fin_plan ?? ini
    // Toca la ventana si empieza dentro, o si empezó antes y todavía no terminó.
    return (ini >= d0 && ini <= d1) || (ini < d0 && fin >= d0)
  })
}

export function TabCronograma({
  obraId, sub, semanas, actividades, archivadas, restricciones, personas, yaSellada,
  acciones, crearImpedimento, liberarImpedimento,
}: {
  obraId: string
  sub: SubCronograma
  semanas: VentanaSemanas
  actividades: Actividad[]
  archivadas: Actividad[]
  restricciones: Restriccion[]
  personas: Persona[]
  yaSellada: boolean
  acciones: AccionesCronograma
  crearImpedimento: AccionFormulario
  liberarImpedimento: (restriccionId: string) => Promise<ResultadoAccion>
}) {
  const base = `/obras/${obraId}?vista=cronograma`
  const abiertos = restricciones.filter((r) => r.estado !== 'liberada')

  return (
    <div className="space-y-4">
      {/* El conmutador de vista. Va arriba y separado del contenido: es una decisión sobre QUÉ mirar,
          no un filtro de lo que se está mirando. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <nav className="flex gap-1" data-testid="sub-cronograma">
          {([['gantt', 'Gantt'], ['proximos', 'Próximos trabajos']] as const).map(([id, label]) => (
            <Link
              key={id}
              href={id === 'gantt' ? base : `${base}&sub=proximos&semanas=${semanas}`}
              data-testid={`sub-${id}`}
              aria-current={sub === id ? 'page' : undefined}
              className={`-mb-[9px] shrink-0 border-b-2 px-3 py-1.5 text-[13px] transition-colors ${
                sub === id ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >{label}</Link>
          ))}
        </nav>

        {/* La ventana sólo existe en «Próximos trabajos»: en el Gantt no significa nada, y un control
            que no hace nada donde está enseña a desconfiar de los controles. */}
        {sub === 'proximos' && (
          <div className="flex gap-1" data-testid="ventana-semanas">
            {SEMANAS.map((s) => (
              <Link
                key={s.v}
                href={`${base}&sub=proximos&semanas=${s.v}`}
                data-testid={`semanas-${s.v}`}
                aria-current={semanas === s.v ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                  semanas === s.v ? 'bg-accent font-medium text-white' : 'text-muted hover:bg-surface-quiet hover:text-ink'
                }`}
              >{s.label}</Link>
            ))}
          </div>
        )}
      </div>

      {sub === 'gantt' ? (
        <div className="space-y-4">
          <Gantt
            actividades={actividades}
            restricciones={restricciones}
            personas={personas}
            yaSellada={yaSellada}
            acciones={acciones}
          />
          {archivadas.length > 0 && (
            <details className="rounded-lg border border-line bg-surface" data-testid="actividades-archivadas">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted">
                {archivadas.length} actividad(es) archivadas
              </summary>
              <ul className="divide-y divide-line/60 border-t border-line">
                {archivadas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate text-[12px] text-muted">{a.nombre}</span>
                    <BotonAccion accion={acciones.archivar} args={[a.id, false]} testid="restaurar-actividad">
                      Restaurar
                    </BotonAccion>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <TabPlanificacion
          proximas={proximas(actividades, semanas)}
          impedimentos={restricciones}
          actividades={actividades}
          crear={crearImpedimento}
          liberar={liberarImpedimento}
        />
      )}

      {/* Los impedimentos abiertos se cuentan en las DOS vistas: son lo que frena el cronograma, y
          esconderlos en una de las dos las vuelve dos verdades distintas sobre la misma obra. */}
      {sub === 'gantt' && abiertos.length > 0 && (
        <p className="text-[12px] text-muted">
          {abiertos.length} impedimento(s) sin resolver ·{' '}
          <Link href={`${base}&sub=proximos&semanas=${semanas}`} className="text-ink underline">verlos</Link>
        </p>
      )}
    </div>
  )
}
