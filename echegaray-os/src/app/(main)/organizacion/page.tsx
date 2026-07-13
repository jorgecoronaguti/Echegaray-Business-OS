import { createClient } from '@/lib/supabase/server'
import {
  getOrganizacion, getSpecialistTasks, getOrgEvents,
} from '@/features/organizacion/services/organizacionService'
import { CONFIANZA_COLOR, SEVERIDAD_COLOR, type OrgSpecialist, type SpecialistResult } from '@/features/organizacion/types'
import { ESTADO_LABEL, ESTADO_COLOR, type OrqTask, type OrqTaskState } from '@/features/orquestador/types'
import { TaskActions } from '@/features/orquestador/components/TaskActions'

// Etapa 4 — ORGANIZACIÓN IA. El Director General IA coordina 11 especialistas que
// trabajan de verdad sobre el Work Fabric (análisis/preparación, Nivel C). Cero
// cálculo nuevo: lee la vista read-only public.orq_org y las vistas orq_* de Etapa
// 3/5. Los especialistas no se coordinan entre sí: todo pasa por el Director.

export const dynamic = 'force-dynamic'

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('es-AR', { hour12: false }) : '—'
}
function usd(n: number | null | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`
}
function dur(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.round(s / 60)}m`
}

async function load() {
  try {
    const supabase = await createClient()
    const [org, tasks, events] = await Promise.all([
      getOrganizacion(supabase), getSpecialistTasks(supabase), getOrgEvents(supabase),
    ])
    return { org, tasks, events }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error al conectar con Supabase'
    const failed = { data: null, error } as const
    return { org: failed, tasks: failed, events: failed }
  }
}

export default async function OrganizacionPage() {
  const { org, tasks, events } = await load()
  const pageError = org.error ?? tasks.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const especialistas = (org.data ?? [])
  const director = especialistas.find((e) => e.slug === 'director-general')
  const equipo = especialistas.filter((e) => e.slug !== 'director-general')

  const tareasPorAgente = new Map<string, OrqTask[]>()
  for (const t of tasks.data ?? []) {
    if (!t.agent_slug) continue
    const arr = tareasPorAgente.get(t.agent_slug) ?? []
    arr.push(t)
    tareasPorAgente.set(t.agent_slug, arr)
  }

  const totTareas = equipo.reduce((s, e) => s + e.tareas, 0)
  const totCosto = equipo.reduce((s, e) => s + Number(e.costo_usd ?? 0), 0)
  const trabajando = equipo.filter((e) => e.estado === 'trabajando').length
  const totFallos = equipo.reduce((s, e) => s + e.fallos, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Organización IA</h1>
        <p className="text-sm text-slate-500">
          Una sola organización digital: el Director General IA coordina a 11 especialistas sobre el Work Fabric.
          Toda la coordinación pasa por Dirección — los especialistas no se asignan trabajo entre sí.
        </p>
      </header>

      {pageError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isAuthError ? 'Iniciá sesión para ver la Organización IA (las vistas respetan RLS).' : `No se pudo cargar: ${pageError}`}
        </div>
      )}

      {/* Resumen */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Metric label="Especialistas" value={equipo.length} />
        <Metric label="Trabajando" value={trabajando} />
        <Metric label="Tareas" value={totTareas} />
        <Metric label="Costo IA" value={usd(totCosto)} small />
        <Metric label="Con fallo" value={totFallos} tone={totFallos ? 'red' : 'default'} />
      </section>

      {/* Director (raíz del organigrama) */}
      {director && (
        <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Dirección</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-slate-900">{director.org_title}</p>
              <p className="text-xs text-slate-500">
                clearance {director.clearance} · {director.default_model} · {director.tareas} objetivos · {usd(director.costo_usd)}
              </p>
            </div>
            <a href="/direccion" className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-50">
              Ir al Centro de Dirección →
            </a>
          </div>
        </section>
      )}

      {/* Especialistas */}
      <Card title="Especialistas bajo Dirección">
        {equipo.length === 0 ? (
          <Empty>Sin especialistas registrados.</Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {equipo.map((e) => (
              <SpecialistCard key={e.slug} e={e} tareas={tareasPorAgente.get(e.slug) ?? []} />
            ))}
          </div>
        )}
      </Card>

      {/* Actividad de la organización */}
      <Card title="Actividad reciente">
        {(events.data ?? []).length === 0 ? (
          <Empty>Sin actividad todavía.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {(events.data ?? []).map((ev) => (
              <li key={ev.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-slate-400">{fmt(ev.created_at)}</span>
                <span className="font-mono text-xs text-slate-700">{ev.type}</span>
                {typeof ev.payload?.agent === 'string' && (
                  <span className="text-xs text-slate-500">· {ev.payload.agent as string}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SpecialistCard({ e, tareas }: { e: OrgSpecialist; tareas: OrqTask[] }) {
  const ultima = tareas.find((t) => (t.result as SpecialistResult | null)?.analysis)
  const res = (ultima?.result as SpecialistResult | null) ?? null
  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{e.org_title}</p>
          <p className="truncate text-xs text-slate-500">
            {e.slug} · clearance {e.clearance} · {e.default_model}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.estado === 'trabajando' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
          {e.estado}
        </span>
      </div>

      {/* métricas del especialista */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <Mini label="Tareas" value={e.tareas} />
        <Mini label="Éxitos" value={e.exitos} />
        <Mini label="Fallos" value={e.fallos} tone={e.fallos ? 'red' : 'default'} />
        <Mini label="Retries" value={e.retries} />
        <Mini label="Costo" value={usd(e.costo_usd)} />
        <Mini label="Durac." value={dur(e.duracion_prom_s)} />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        última actividad: {fmt(e.ultima_actividad)}{e.tokens ? ` · ${e.tokens.toLocaleString('es-AR')} tokens` : ''}
      </p>

      {/* último trabajo: evidencia */}
      {res?.analysis && (
        <div className="mt-3 rounded bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Último análisis</p>
            {res.confidence && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONFIANZA_COLOR[res.confidence] ?? ''}`}>
                confianza {res.confidence}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700">{res.analysis.slice(0, 400)}</p>
          {!!res.findings?.length && (
            <ul className="mt-2 space-y-1">
              {res.findings.slice(0, 3).map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                  <span className={`mt-0.5 rounded px-1 py-0.5 text-[10px] ${SEVERIDAD_COLOR[f.severidad ?? 'info'] ?? ''}`}>
                    {f.severidad ?? 'info'}
                  </span>
                  <span><strong>{f.titulo}</strong>{f.detalle ? ` — ${f.detalle}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {!!res.recommendations?.length && (
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
              {res.recommendations.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {!!res.approval_requests?.length && (
            <p className="mt-2 text-xs text-amber-700">
              {res.approval_requests.length} solicitud(es) de aprobación humana registrada(s) (no ejecutadas).
            </p>
          )}
        </div>
      )}

      {/* tareas recientes con control humano */}
      {tareas.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Tareas recientes</p>
          <ul className="divide-y divide-slate-100">
            {tareas.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs text-slate-700">{t.title}</p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ESTADO_COLOR[t.state as OrqTaskState]}`}>
                    {ESTADO_LABEL[t.state as OrqTaskState]}
                  </span>
                </div>
                <TaskActions taskId={t.id} state={t.state} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone = 'default', small = false }: {
  label: string; value: number | string; tone?: 'default' | 'red'; small?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`${small ? 'text-lg' : 'text-2xl'} font-semibold ${tone === 'red' && value ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Mini({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'red' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-semibold ${tone === 'red' && value ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
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
