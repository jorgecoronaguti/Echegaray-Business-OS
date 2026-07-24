'use client'

import { useActionState, useMemo } from 'react'
import type { AccionPlan, CambiosPlan, EstadoPlan, PlanVigente, SeguimientoTarea } from '../types/plan'
import { aprobarPlanAction, type AprobarState } from '../services/planActions'

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
const dia = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

// El estado del PLAN. Color sólo con significado: pendiente pide una decisión (ámbar), autorizado está
// en marcha (azul), ejecutado ya es trabajo (verde).
const ESTADO_PLAN: Record<EstadoPlan, { label: string; chip: string; borde: string }> = {
  pendiente_ejecucion: { label: 'Pendiente de aprobación', chip: 'bg-amber-100 text-amber-800', borde: 'border-amber-300' },
  autorizado: { label: 'Aprobado · generando trabajo', chip: 'bg-blue-100 text-blue-800', borde: 'border-blue-300' },
  ejecutado: { label: 'En ejecución', chip: 'bg-emerald-100 text-emerald-800', borde: 'border-emerald-300' },
}

// El verbo de cada acción, para leerla de un vistazo.
const VERBO: Record<AccionPlan['tipo'], { label: string; punta: string }> = {
  cobrar: { label: 'Cobrar', punta: 'text-emerald-700' },
  pagar: { label: 'Pagar', punta: 'text-slate-800' },
  postergar: { label: 'Postergar', punta: 'text-amber-700' },
  financiar: { label: 'Usar línea', punta: 'text-blue-700' },
  cancelar_financiacion: { label: 'Cancelar línea', punta: 'text-blue-700' },
}

// El estado real de la tarea en el Work Fabric, traducido a algo que Dirección entiende.
const ESTADO_TAREA: Record<string, { label: string; chip: string }> = {
  received: { label: 'En cola', chip: 'bg-slate-100 text-slate-600' },
  ready: { label: 'En cola', chip: 'bg-slate-100 text-slate-600' },
  blocked: { label: 'Esperando dependencia', chip: 'bg-slate-100 text-slate-500' },
  claimed: { label: 'Preparándose', chip: 'bg-blue-100 text-blue-700' },
  running: { label: 'Preparándose', chip: 'bg-blue-100 text-blue-700' },
  reviewing: { label: 'En revisión', chip: 'bg-blue-100 text-blue-700' },
  awaiting_approval: { label: 'Requiere aprobación', chip: 'bg-amber-100 text-amber-800' },
  paused: { label: 'En pausa', chip: 'bg-slate-100 text-slate-500' },
  succeeded: { label: 'Completada', chip: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Falló', chip: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Reemplazada', chip: 'bg-slate-100 text-slate-400 line-through' },
  retrying: { label: 'Reintentando', chip: 'bg-amber-100 text-amber-700' },
}

const AGENTE: Record<string, string> = {
  comercial: 'Comercial', administracion: 'Administración', compras: 'Compras', cfo: 'CFO', fiscal: 'Fiscal',
}

export function PlanEjecucionView({ vigente, seguimiento }: { vigente: PlanVigente; seguimiento: SeguimientoTarea[] }) {
  const horizonte = vigente.plan?.horizontes?.[vigente.horizonte as 'dias_7'] ?? vigente.plan?.horizontes?.dias_7
  const acciones = useMemo(
    () => [...(horizonte?.acciones ?? [])].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)),
    [horizonte],
  )
  // La descripción de cada acción es única y es el título de su tarea: así se cruza plan ↔ Work Fabric.
  const estadoPorTitulo = useMemo(() => new Map(seguimiento.map((t) => [t.title, t])), [seguimiento])
  const idAFecha = useMemo(() => new Map(acciones.map((a) => [a.id, a.fecha])), [acciones])
  const est = ESTADO_PLAN[vigente.estado]
  const ejecutado = vigente.estado === 'ejecutado'

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Plan de ejecución</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${est.chip}`}>{est.label}</span>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        La estrategia que el Financial Engineering propone para coordinar cobros, pagos y líneas — en orden y
        respetando qué depende de qué. El recálculo es automático; ejecutarla requiere tu aprobación.
      </p>

      {vigente.cambios && <Cambios cambios={vigente.cambios} />}

      {acciones.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          El plan no propone acciones en este horizonte: la caja cubre lo que viene.
        </p>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {acciones.map((a, i) => {
            const t = estadoPorTitulo.get(a.descripcion)
            const v = VERBO[a.tipo]
            return (
              <li key={a.id} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="w-12 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-slate-400">{dia(a.fecha)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-sm font-medium ${v.punta}`}>{v.label}</span>
                    <span className="truncate text-sm text-slate-700">{a.descripcion.replace(/^\S+\s/, '')}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{a.motivo}</div>
                  {a.dependencias.length > 0 && (
                    <div className="mt-1 text-[11px] text-slate-400">
                      Depende de {a.dependencias.map((d) => dia(idAFecha.get(d) ?? '')).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {a.costo_financiero > 0 && <div className="text-[11px] text-amber-700">cuesta {money(a.costo_financiero)}</div>}
                  {ejecutado && t ? (
                    <div className="mt-0.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(ESTADO_TAREA[t.state] ?? ESTADO_TAREA.received).chip}`}>
                        {(ESTADO_TAREA[t.state] ?? { label: t.state }).label}
                      </span>
                      {t.agent_slug && <div className="mt-0.5 text-[10px] text-slate-400">{AGENTE[t.agent_slug] ?? t.agent_slug} IA</div>}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[11px] text-slate-400">{a.requiere_aprobacion ? 'requiere aprobación' : ''}</div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {vigente.estado === 'pendiente_ejecucion' && acciones.length > 0 && (
        <Aprobar horizonte={vigente.horizonte} calculadoEn={vigente.calculado_en} n={acciones.length} />
      )}
      {vigente.estado === 'autorizado' && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Plan aprobado. El OS está creando el trabajo para los especialistas — en un momento vas a ver el estado de cada acción.
        </p>
      )}
    </section>
  )
}

function Cambios({ cambios }: { cambios: CambiosPlan }) {
  const total = cambios.agregadas.length + cambios.eliminadas.length + cambios.reprogramadas.length
  if (total === 0) return null
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span className="font-medium text-slate-700">Cambió respecto del plan anterior:</span>{' '}
      {cambios.agregadas.length > 0 && <span>{cambios.agregadas.length} nueva{cambios.agregadas.length > 1 ? 's' : ''}</span>}
      {cambios.eliminadas.length > 0 && <span>{cambios.agregadas.length ? ' · ' : ''}{cambios.eliminadas.length} eliminada{cambios.eliminadas.length > 1 ? 's' : ''}</span>}
      {cambios.reprogramadas.length > 0 && <span>{cambios.agregadas.length || cambios.eliminadas.length ? ' · ' : ''}{cambios.reprogramadas.length} reprogramada{cambios.reprogramadas.length > 1 ? 's' : ''}</span>}
    </div>
  )
}

const estadoInicial: AprobarState = { ok: false, error: null, mensaje: null }

function Aprobar({ horizonte, calculadoEn, n }: { horizonte: string; calculadoEn: string; n: number }) {
  const [state, formAction, pending] = useActionState(aprobarPlanAction, estadoInicial)
  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="horizonte" value={horizonte} />
      <input type="hidden" name="calculado_en" value={calculadoEn} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Al aprobar se crean {n} tarea{n > 1 ? 's' : ''} para los especialistas. No se ejecutan pagos ni operaciones bancarias:
          los movimientos de dinero siguen requiriendo tu aprobación aparte.
        </p>
        <button
          type="submit"
          disabled={pending || state.ok}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? 'Aprobando…' : state.ok ? 'Aprobado ✓' : 'Aprobar y convertir en trabajo'}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-700">{state.error}</p>}
      {state.mensaje && <p className="mt-2 text-xs text-slate-600">{state.mensaje}</p>}
    </form>
  )
}
