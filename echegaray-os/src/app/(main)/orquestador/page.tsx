import { createClient } from '@/lib/supabase/server'
import {
  getQueue, getRecentTasks, getDeadLetter, getRecentEvents, getAgents, getWorkerActivity,
} from '@/features/orquestador/services/orquestadorService'
import { ESTADO_LABEL, ESTADO_COLOR, type OrqTaskState } from '@/features/orquestador/types'
import { TaskActions } from '@/features/orquestador/components/TaskActions'

// Fase 5 del Work Fabric: Control Humano + Observabilidad del orquestador autónomo
// dentro de la interfaz existente. Cero cálculo nuevo: lee las vistas read-only
// public.orq_* (que reflejan el schema orq, fuente única de verdad) y ofrece las
// acciones de control humano vía la RPC gateada por policy.

export const dynamic = 'force-dynamic'

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-AR', { hour12: false })
}

async function load() {
  try {
    const supabase = await createClient()
    const [queue, tasks, dead, events, agents, activity] = await Promise.all([
      getQueue(supabase), getRecentTasks(supabase), getDeadLetter(supabase),
      getRecentEvents(supabase), getAgents(supabase), getWorkerActivity(supabase),
    ])
    return { queue, tasks, dead, events, agents, activity }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error al conectar con Supabase'
    const failed = { data: null, error } as const
    return { queue: failed, tasks: failed, dead: failed, events: failed, agents: failed, activity: failed }
  }
}

export default async function OrquestadorPage() {
  const { queue, tasks, dead, events, agents, activity } = await load()
  const pageError = queue.error ?? tasks.error ?? events.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const queueRows = (queue.data ?? []).filter((r) => r.n > 0)
  const activos = (queue.data ?? []).filter((r) => r.is_active).reduce((s, r) => s + r.n, 0)
  const deadCount = (queue.data ?? []).find((r) => r.state === 'dead_letter')?.n ?? 0
  const workers = new Set((activity.data ?? []).map((a) => a.worker_id).filter(Boolean))
  const ultimoLatido = (activity.data ?? [])[0]?.started_at ?? null

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Orquestador — Work Fabric</h1>
        <p className="text-sm text-slate-500">
          Núcleo autónomo 24×7. Estado en vivo desde <code>public.orq_*</code> (schema <code>orq</code>, fuente única).
        </p>
      </header>

      {pageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isAuthError
            ? 'Iniciá sesión para ver el estado del orquestador (las vistas respetan RLS).'
            : `No se pudo cargar el estado: ${pageError}`}
        </div>
      )}

      {/* Resumen */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="En vuelo" value={activos} hint="claimed/running/reviewing" />
        <Metric label="Dead-letter" value={deadCount} hint="requieren intervención" tone={deadCount ? 'red' : 'default'} />
        <Metric label="Workers activos (1h)" value={workers.size} hint="por task_attempts" />
        <Metric label="Último latido" value={ultimoLatido ? fmt(ultimoLatido) : '—'} small />
      </section>

      {/* Cola por estado */}
      <Card title="Cola por estado">
        {queueRows.length === 0 ? (
          <Empty>Cola vacía.</Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {queueRows.map((r) => (
              <span key={r.state} className={`rounded-full px-3 py-1 text-xs font-medium ${ESTADO_COLOR[r.state as OrqTaskState]}`}>
                {ESTADO_LABEL[r.state as OrqTaskState]}: <strong>{r.n}</strong>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Dead-letter con control humano */}
      <Card title="Dead-letter — control humano">
        {(dead.data ?? []).length === 0 ? (
          <Empty>Sin tareas en dead-letter.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(dead.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.type} · intentos {t.attempt}/{t.max_attempts} · {t.error?.slice(0, 120) ?? 'sin error'}
                  </p>
                </div>
                <TaskActions taskId={t.id} state={t.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Tareas recientes */}
      <Card title="Tareas recientes">
        {(tasks.data ?? []).length === 0 ? (
          <Empty>Sin tareas todavía.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Título</th><th className="px-3">Tipo</th>
                  <th className="px-3">Estado</th><th className="px-3">Agente</th>
                  <th className="px-3">Intento</th><th className="px-3">Actualizada</th>
                  <th className="px-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(tasks.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="max-w-[16rem] truncate py-2 pr-3 font-medium text-slate-800">{t.title}</td>
                    <td className="px-3 text-slate-500">{t.type}</td>
                    <td className="px-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLOR[t.state]}`}>
                        {ESTADO_LABEL[t.state]}
                      </span>
                    </td>
                    <td className="px-3 text-slate-500">{t.agent_slug ?? '—'}</td>
                    <td className="px-3 text-slate-500">{t.attempt}/{t.max_attempts}</td>
                    <td className="px-3 text-slate-500">{fmt(t.updated_at)}</td>
                    <td className="px-3"><TaskActions taskId={t.id} state={t.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Agentes */}
      <Card title="Agentes registrados">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(agents.data ?? []).map((a) => (
            <div key={a.slug} className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-medium text-slate-800">{a.role}</p>
              <p className="text-xs text-slate-500">
                {a.slug} · clearance {a.clearance} · {a.default_model} · máx ${Number(a.max_cost_usd_per_task).toFixed(2)}/tarea
              </p>
            </div>
          ))}
          {(agents.data ?? []).length === 0 && <Empty>Sin agentes.</Empty>}
        </div>
      </Card>

      {/* Timeline de eventos */}
      <Card title="Eventos recientes">
        {(events.data ?? []).length === 0 ? (
          <Empty>Sin eventos.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-400">{fmt(e.created_at)}</span>
                <span className="font-mono text-xs text-slate-700">{e.type}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Metric({ label, value, hint, tone = 'default', small = false }: {
  label: string; value: number | string; hint?: string; tone?: 'default' | 'red'; small?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`${small ? 'text-sm' : 'text-2xl'} font-semibold ${tone === 'red' && value ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>
}
