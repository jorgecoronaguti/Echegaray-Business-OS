import { createClient } from '@/lib/supabase/server'
import { getBacklogAutonomo } from '@/features/backlog-autonomo/services/backlogAutonomoService'
import {
  TIPO_BACKLOG_LABEL,
  NIVEL_AUTONOMIA_LABEL,
  ESTADO_BACKLOG_LABEL,
} from '@/features/backlog-autonomo/types'
import type { EstadoBacklog, ImpactoBacklog } from '@/features/backlog-autonomo/types'
import { ConvertirBacklogEnAccionForm } from '@/features/backlog-autonomo/components/ConvertirBacklogEnAccionForm'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { ESTADO_ACCION_LABEL } from '@/features/acciones/types'

async function loadBacklogData() {
  try {
    const supabase = await createClient()
    const [backlog, acciones] = await Promise.all([getBacklogAutonomo(supabase), getAcciones(supabase)])
    return { backlog, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { backlog: { data: null, error } as const, acciones: { data: null, error } as const }
  }
}

const IMPACTO_BADGE: Record<ImpactoBacklog, string> = {
  alta: 'bg-red-100 text-red-800',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-gray-100 text-gray-700',
}

const ESTADO_ORDEN: EstadoBacklog[] = ['abierto', 'en_curso', 'resuelto', 'descartado']

export default async function BacklogAutonomoPage() {
  const { backlog, acciones } = await loadBacklogData()

  const pageError = backlog.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = backlog.data ?? []
  const accionesPorOrigenId = new Map((acciones.data ?? []).map((a) => [a.alerta_origen_id, a]))

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Backlog Autónomo</h1>
        <p className="mt-2 text-gray-600">
          Trabajo detectado por el propio sistema (gaps, riesgos, anomalías, oportunidades) — Track B / punto 6.
          Convertir en acción lo lleva al Centro de Acción; no es un segundo task manager.
        </p>
      </div>

      {pageError && isAuthError && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No hay sesión autenticada — RLS está bloqueando el acceso correctamente.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}
      {pageError && !isAuthError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" data-testid="page-error">
          <p className="font-semibold">Supabase no está configurado o no responde.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}

      {backlog.data && (
        <section data-testid="backlog-autonomo-section" className="space-y-8">
          {ESTADO_ORDEN.map((estado) => {
            const items = lista.filter((i) => i.estado === estado)
            if (items.length === 0) return null
            return (
              <div key={estado}>
                <h2 className="text-xl font-semibold">
                  {ESTADO_BACKLOG_LABEL[estado]} <span className="text-sm font-normal text-gray-500">({items.length})</span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => {
                    const accionExistente = accionesPorOrigenId.get(item.id)
                    return (
                      <li key={item.id} className="rounded border p-3" data-testid="backlog-fila">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${IMPACTO_BADGE[item.impacto]}`}>
                              {TIPO_BACKLOG_LABEL[item.tipo]} · impacto {item.impacto}
                            </span>
                            <p className="mt-1 font-semibold">{item.titulo}</p>
                          </div>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                          <div>
                            <dt className="font-medium">Urgencia</dt>
                            <dd>{item.urgencia}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Esfuerzo</dt>
                            <dd>{item.esfuerzo}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Confianza</dt>
                            <dd className="capitalize">{item.confianza}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Autonomía permitida</dt>
                            <dd>{NIVEL_AUTONOMIA_LABEL[item.nivel_autonomia_permitido]}</dd>
                          </div>
                        </dl>
                        <p className="mt-2 text-sm">
                          <span className="font-medium">Evidencia: </span>
                          {item.evidencia}
                        </p>
                        <p className="text-sm">
                          <span className="font-medium">Recomendación: </span>
                          {item.recomendacion}
                        </p>
                        {item.dependencia && (
                          <p className="text-sm text-amber-800">
                            <span className="font-medium">Dependencia: </span>
                            {item.dependencia}
                          </p>
                        )}

                        {estado === 'abierto' &&
                          (accionExistente ? (
                            <p className="mt-2 text-xs text-gray-500" data-testid="backlog-ya-convertido">
                              Ya convertido en acción — estado: {ESTADO_ACCION_LABEL[accionExistente.estado]}
                            </p>
                          ) : (
                            <ConvertirBacklogEnAccionForm item={item} />
                          ))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
