import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObjetivos, getTitularesNegocio } from '@/features/direccion/services/direccionService'
import { getQueue } from '@/features/orquestador/services/orquestadorService'
import { getPendingOperations } from '@/features/aprobaciones/services/aprobacionesService'
import { PreguntaForm } from '@/features/os/components/PreguntaForm'
import { AutoRefresh } from '@/features/os/components/AutoRefresh'
import { OperacionCard } from '@/features/aprobaciones/components/OperacionCard'
import { ESTADO_OBJETIVO_LABEL, ESTADO_OBJETIVO_COLOR, type DireccionObjetivo } from '@/features/direccion/types'
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
    const [objetivos, negocio, queue, pendientes] = await Promise.all([
      getObjetivos(supabase),
      getTitularesNegocio(supabase),
      getQueue(supabase),
      getPendingOperations(supabase),
    ])
    return { objetivos, negocio, queue, pendientes, error: objetivos.error ?? negocio.error }
  } catch (err) {
    return { objetivos: null, negocio: null, queue: null, pendientes: null, error: err instanceof Error ? err.message : 'Error' }
  }
}

export default async function OsPage() {
  const { objetivos, negocio, queue, pendientes, error } = await load()
  const isAuth = error?.toLowerCase().includes('permission denied') ?? false

  const objs = (objetivos?.data ?? []) as DireccionObjetivo[]
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

      {/* Mirar */}
      <Card
        title="Trabajo del OS"
        action={<Link href="/direccion" className="text-xs text-indigo-600 hover:underline">Ver detalle →</Link>}
      >
        {objs.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no diste ningún objetivo. Empezá arriba.</p>
        ) : (
          <ul className="space-y-3">
            {objs.slice(0, 6).map((o) => (
              <li key={o.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{o.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_OBJETIVO_COLOR[o.state] ?? 'bg-slate-100 text-slate-700'}`}>
                    {ESTADO_OBJETIVO_LABEL[o.state] ?? o.state}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {fmt(o.created_at)} · {o.subtasks_done}/{o.subtasks} especialistas
                  {o.subtasks_failed > 0 && <span className="text-red-600"> · {o.subtasks_failed} con fallo</span>}
                </p>
                {o.result?.executive_summary && (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{o.result.executive_summary}</p>
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
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Accesos */}
      <section className="flex flex-wrap gap-2">
        {[
          { href: '/direccion', label: 'Dirección' },
          { href: '/organizacion', label: 'Organización IA' },
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
