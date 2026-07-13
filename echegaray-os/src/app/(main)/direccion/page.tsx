import { createClient } from '@/lib/supabase/server'
import { getObjetivos, getTitularesNegocio, getCierres } from '@/features/direccion/services/direccionService'
import { getQueue, getAgents } from '@/features/orquestador/services/orquestadorService'
import { ESTADO_OBJETIVO_LABEL, ESTADO_OBJETIVO_COLOR, ESTADO_CIERRE_COLOR, type ObjetivoCierre } from '@/features/direccion/types'
import { ObjetivoForm } from '@/features/direccion/components/ObjetivoForm'

// Etapa 3 — CENTRO DE DIRECCIÓN. El Director IA dirige el trabajo de la
// organización digital: comprende el estado, recibe objetivos, los transforma en
// planes, genera y asigna tareas en el Work Fabric y reporta. Reutiliza las
// vistas public.orq_* y la RPC orq_submit_objective. No es un dashboard pasivo:
// desde acá se le dan objetivos y se leen sus decisiones.

export const dynamic = 'force-dynamic'

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('es-AR', { hour12: false }) : '—'
}

async function load() {
  try {
    const supabase = await createClient()
    const [objetivos, negocio, queue, agents, cierres] = await Promise.all([
      getObjetivos(supabase), getTitularesNegocio(supabase), getQueue(supabase), getAgents(supabase), getCierres(supabase),
    ])
    return { objetivos, negocio, queue, agents, cierres }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error al conectar con Supabase'
    const failed = { data: null, error } as const
    return { objetivos: failed, negocio: failed, queue: failed, agents: failed, cierres: failed }
  }
}

export default async function DireccionPage() {
  const { objetivos, negocio, queue, agents, cierres } = await load()
  const cierrePorObjetivo = (cierres.data ?? {}) as Record<string, ObjetivoCierre>
  const pageError = objetivos.error ?? negocio.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const activos = (queue.data ?? []).filter((r) => r.is_active).reduce((s, r) => s + r.n, 0)
  const deadLetter = (queue.data ?? []).find((r) => r.state === 'dead_letter')?.n ?? 0
  const nBacklog = negocio.data?.backlog ?? 0
  const nAcciones = negocio.data?.acciones ?? 0
  const nObras = negocio.data?.obras ?? 0

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Centro de Dirección</h1>
        <p className="text-sm text-slate-500">
          El Director IA comprende el estado, interpreta objetivos, prioriza, planifica y coordina especialistas.
        </p>
      </header>

      {pageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isAuthError ? 'Iniciá sesión para operar el Centro de Dirección.' : `No se pudo cargar: ${pageError}`}
        </div>
      )}

      {/* Titulares de estado (negocio + sistema) */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Metric label="Backlog abierto" value={nBacklog} />
        <Metric label="Acciones" value={nAcciones} />
        <Metric label="Obras" value={nObras} />
        <Metric label="Tareas en vuelo" value={activos} />
        <Metric label="Bloqueadas" value={deadLetter} tone={deadLetter ? 'red' : 'default'} />
      </section>

      {/* Dar un objetivo */}
      <Card title="Dar un objetivo al Director">
        <ObjetivoForm />
        <p className="mt-3 text-xs text-slate-400">
          El Director interpreta el objetivo, arma un plan, crea tareas en el Work Fabric y las asigna a los
          especialistas correspondientes. Las acciones que requieren aprobación humana no se ejecutan: quedan
          registradas como solicitudes.
        </p>
      </Card>

      {/* Objetivos dirigidos */}
      <Card title="Objetivos de Dirección">
        {(objetivos.data ?? []).length === 0 ? (
          <Empty>Todavía no diste ningún objetivo.</Empty>
        ) : (
          <ul className="space-y-4">
            {(objetivos.data ?? []).map((o) => {
              const r = o.result
              return (
                <li key={o.id} className="rounded-lg border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{o.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_OBJETIVO_COLOR[o.state] ?? 'bg-slate-100 text-slate-700'}`}>
                      {ESTADO_OBJETIVO_LABEL[o.state] ?? o.state}
                    </span>
                  </div>
                  {o.goal && <p className="mt-1 text-sm text-slate-500">{o.goal}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {fmt(o.created_at)} · plan: {o.subtasks_done}/{o.subtasks} completadas
                    {o.subtasks_failed > 0 && <span className="text-red-600"> · {o.subtasks_failed} con fallo</span>}
                  </p>

                  {r?.executive_summary && (
                    <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">{r.executive_summary}</p>
                  )}

                  {(() => {
                    const cierre = cierrePorObjetivo[o.id]?.closure
                    if (!cierre?.closure_summary) return null
                    return (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Cierre del Director</p>
                          {cierre.objective_status && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_CIERRE_COLOR[cierre.objective_status] ?? ''}`}>
                              {cierre.objective_status}
                            </span>
                          )}
                          {cierre.counts && (
                            <span className="text-[11px] text-slate-500">
                              {cierre.counts.succeeded ?? 0}/{cierre.counts.total ?? 0} especialistas
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700">{cierre.closure_summary}</p>
                        {!!cierre.key_points?.length && (
                          <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                            {cierre.key_points.map((k, i) => <li key={i}>{k}</li>)}
                          </ul>
                        )}
                      </div>
                    )
                  })()}

                  {!!r?.priorities?.length && (
                    <Block title="Prioridades">
                      <ul className="list-disc pl-5 text-sm text-slate-600">
                        {r.priorities.map((p, i) => (
                          <li key={i}><strong>{p.titulo}</strong>{p.razon ? ` — ${p.razon}` : ''}</li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {!!r?.assigned?.length && (
                    <Block title="Trabajo asignado a especialistas">
                      <div className="flex flex-wrap gap-1.5">
                        {r.assigned.map((a, i) => (
                          <span key={i} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                            {a.capability} → {a.agent ?? 'sin agente'}
                          </span>
                        ))}
                      </div>
                    </Block>
                  )}

                  {!!r?.recommendations?.length && (
                    <Block title="Recomendaciones">
                      <ul className="list-disc pl-5 text-sm text-slate-600">
                        {r.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                      </ul>
                    </Block>
                  )}

                  {!!r?.approval_requests?.length && (
                    <Block title="Solicitudes de aprobación humana">
                      <ul className="space-y-1 text-sm">
                        {r.approval_requests.map((ar, i) => (
                          <li key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                            <strong>{ar.titulo}</strong>{ar.motivo ? ` — ${ar.motivo}` : ''}
                          </li>
                        ))}
                      </ul>
                    </Block>
                  )}

                  {o.error && <p className="mt-2 text-xs text-red-600">Error: {o.error}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Especialistas coordinados */}
      <Card title="Especialistas bajo Dirección">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(agents.data ?? []).filter((a) => a.slug !== 'director-general').map((a) => (
            <div key={a.slug} className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-medium text-slate-800">{a.role}</p>
              <p className="text-xs text-slate-500">{a.slug} · clearance {a.clearance} · {a.default_model}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Los especialistas no se coordinan directamente entre sí: toda asignación pasa por el Director (invariante del sistema).
          </p>
          <a href="/organizacion" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Ver Organización IA →
          </a>
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'red' }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold ${tone === 'red' && value ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>
}
