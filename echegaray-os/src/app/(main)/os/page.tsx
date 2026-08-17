import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObjetivos, getTitularesNegocio, getCierres } from '@/features/direccion/services/direccionService'
import { getQueue } from '@/features/orquestador/services/orquestadorService'
import { getPendingOperations } from '@/features/aprobaciones/services/aprobacionesService'
import { PreguntaForm } from '@/features/os/components/PreguntaForm'
import { AutoRefresh } from '@/features/os/components/AutoRefresh'
import { OperacionCard } from '@/features/aprobaciones/components/OperacionCard'
import { type DireccionObjetivo, type ObjetivoCierre } from '@/features/direccion/types'
import type { PendingOperation } from '@/features/aprobaciones/types'

// Centro de Operación — la interfaz para trabajar con el OS: comandar (dar un
// objetivo), decidir (aprobar operaciones de efecto externo) y mirar (qué está
// haciendo la organización). Reúne las capacidades que ya existen (Dirección,
// Aprobaciones, Organización) en una sola pantalla de trabajo.

export const dynamic = 'force-dynamic'

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('es-AR', { hour12: false }) : '—'
}

async function load() {
  try {
    const supabase = await createClient()
    const [objetivos, negocio, queue, pendientes, cierres] = await Promise.all([
      getObjetivos(supabase),
      getTitularesNegocio(supabase),
      getQueue(supabase),
      getPendingOperations(supabase),
      getCierres(supabase),
    ])
    return { objetivos, negocio, queue, pendientes, cierres, error: objetivos.error ?? negocio.error }
  } catch (err) {
    return { objetivos: null, negocio: null, queue: null, pendientes: null, cierres: null, error: err instanceof Error ? err.message : 'Error' }
  }
}

// Estado real de una pregunta desde la perspectiva del usuario: ¿ya hay respuesta?
function estadoPregunta(o: DireccionObjetivo, cierre: ObjetivoCierre | undefined) {
  const respuesta = cierre?.closure?.closure_summary
  if (respuesta) {
    const st = cierre?.closure?.objective_status
    return { fase: 'respondido' as const, respuesta, keyPoints: cierre?.closure?.key_points ?? [], badge: st === 'bloqueado' ? 'Respondido (con bloqueos)' : 'Respondido', color: st === 'bloqueado' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700' }
  }
  if (['failed', 'dead_letter', 'cancelled'].includes(o.state)) {
    return { fase: 'error' as const, respuesta: null, keyPoints: [], badge: 'No se pudo', color: 'bg-red-100 text-red-700' }
  }
  return { fase: 'trabajando' as const, respuesta: null, keyPoints: [], badge: 'Trabajando…', color: 'bg-indigo-100 text-indigo-700' }
}

export default async function OsPage() {
  const { objetivos, negocio, queue, pendientes, cierres, error } = await load()
  const isAuth = error?.toLowerCase().includes('permission denied') ?? false

  const objs = (objetivos?.data ?? []) as DireccionObjetivo[]
  const cierrePorObjetivo = (cierres?.data ?? {}) as Record<string, ObjetivoCierre>
  const pend = ((pendientes?.data ?? []) as PendingOperation[]).filter((o) => o.status === 'awaiting_approval')
  const activos = (queue?.data ?? []).filter((r) => r.is_active).reduce((s, r) => s + r.n, 0)
  const enCurso = objs.filter((o) => ['ready', 'claimed', 'running', 'reviewing', 'retrying'].includes(o.state)).length

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <AutoRefresh seconds={15} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Centro de Operación</h1>
        <p className="text-sm text-slate-500">
          Preguntale o pedile lo que necesites al OS. Su organización de especialistas —cada uno con su conocimiento y
          las fuentes de datos reales de la empresa— trabaja la respuesta. Lo que tenga efecto externo espera tu aprobación.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isAuth ? 'Iniciá sesión para operar el Centro de Operación.' : `No se pudo cargar: ${error}`}
        </div>
      )}

      {/* Titulares */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Backlog" value={negocio?.data?.backlog ?? 0} />
        <Metric label="Acciones" value={negocio?.data?.acciones ?? 0} />
        <Metric label="Obras" value={negocio?.data?.obras ?? 0} />
        <Metric label="En curso" value={enCurso} />
        <Metric label="Tareas en vuelo" value={activos} />
        <Metric label="Por aprobar" value={pend.length} tone={pend.length ? 'amber' : 'default'} />
      </section>

      {/* Preguntar / pedir (cualquier usuario) */}
      <Card title="¿Qué necesitás?">
        <PreguntaForm />
      </Card>

      {/* Decidir */}
      <Card
        title="Necesita tu decisión"
        action={<Link href="/aprobaciones" className="text-xs text-indigo-600 hover:underline">Ver todo →</Link>}
      >
        {pend.length === 0 ? (
          <p className="text-sm text-slate-400">No hay operaciones esperando tu aprobación.</p>
        ) : (
          <ul className="space-y-3">
            {pend.slice(0, 5).map((op) => (
              <OperacionCard key={op.id} op={op} />
            ))}
          </ul>
        )}
      </Card>

      {/* Respuestas del OS */}
      <Card
        title="Preguntas y respuestas"
        action={<Link href="/obras" className="text-xs text-indigo-600 hover:underline">Ver detalle completo →</Link>}
      >
        {objs.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no le preguntaste nada al OS. Empezá arriba.</p>
        ) : (
          <ul className="space-y-3">
            {objs.slice(0, 8).map((o) => {
              const e = estadoPregunta(o, cierrePorObjetivo[o.id])
              return (
                <li key={o.id} className="rounded-lg border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{o.goal || o.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.color}`}>{e.badge}</span>
                  </div>

                  {e.fase === 'respondido' && (
                    <div className="mt-2 rounded-lg bg-emerald-50/50 p-3">
                      <p className="text-sm text-slate-700">{e.respuesta}</p>
                      {!!e.keyPoints.length && (
                        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                          {e.keyPoints.slice(0, 5).map((k, i) => <li key={i}>{k}</li>)}
                        </ul>
                      )}
                    </div>
                  )}

                  {e.fase === 'trabajando' && (
                    <p className="mt-1 text-xs text-slate-500">
                      El OS está trabajando la respuesta — {o.subtasks_done}/{o.subtasks || '…'} especialistas listos.
                      Aparece acá sola en cuanto termina.
                    </p>
                  )}

                  {e.fase === 'error' && (
                    <p className="mt-1 text-xs text-red-600">No se pudo resolver{o.error ? `: ${o.error.slice(0, 100)}` : '.'}</p>
                  )}

                  {!!o.result?.assigned?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.result.assigned.map((a, i) => (
                        <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                          {a.agent ?? a.capability}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">{fmt(o.created_at)}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Accesos */}
      <section className="flex flex-wrap gap-2">
        {[
          { href: '/obras', label: 'Dirección' },
          { href: '/obras', label: 'Organización IA' },
          { href: '/aprobaciones', label: 'Aprobaciones' },
          { href: '/flujo-caja', label: 'Flujo de Caja' },
          { href: '/reportes', label: 'Reportes' },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {l.label} →
          </Link>
        ))}
      </section>
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'amber' }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xl font-semibold ${tone === 'amber' && value ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
