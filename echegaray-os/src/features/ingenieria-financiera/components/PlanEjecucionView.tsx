'use client'

import { useActionState, useMemo } from 'react'
import type { AccionPlan, CambiosPlan, EstadoPlan, PlanVigente, SeguimientoTarea } from '../types/plan'
import { aprobarPlanAction, type AprobarState } from '../services/planActions'
import { money } from '@/shared/utils/format'
import { Card, Badge, Callout, type Tono } from '@/shared/components/ui'

const dia = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

// El estado del PLAN. Color sólo con significado: pendiente pide una decisión (ámbar), autorizado está
// en marcha (info), ejecutado ya es trabajo (verde).
const ESTADO_PLAN: Record<EstadoPlan, { label: string; tono: Tono }> = {
  pendiente_ejecucion: { label: 'Pendiente de aprobación', tono: 'warn' },
  autorizado: { label: 'Aprobado · generando trabajo', tono: 'info' },
  ejecutado: { label: 'En ejecución', tono: 'pos' },
}

// El verbo de cada acción, para leerla de un vistazo.
const VERBO: Record<AccionPlan['tipo'], { label: string; punta: string }> = {
  cobrar: { label: 'Cobrar', punta: 'text-pos' },
  pagar: { label: 'Pagar', punta: 'text-ink' },
  postergar: { label: 'Postergar', punta: 'text-warn' },
  financiar: { label: 'Usar línea', punta: 'text-info' },
  cancelar_financiacion: { label: 'Cancelar línea', punta: 'text-info' },
}

// El estado real de la tarea en el Work Fabric, traducido a algo que Dirección entiende.
const ESTADO_TAREA: Record<string, { label: string; tono: Tono; strike?: boolean }> = {
  received: { label: 'En cola', tono: 'neutral' },
  ready: { label: 'En cola', tono: 'neutral' },
  blocked: { label: 'Esperando dependencia', tono: 'neutral' },
  claimed: { label: 'Preparándose', tono: 'info' },
  running: { label: 'Preparándose', tono: 'info' },
  reviewing: { label: 'En revisión', tono: 'info' },
  awaiting_approval: { label: 'Requiere aprobación', tono: 'warn' },
  paused: { label: 'En pausa', tono: 'neutral' },
  succeeded: { label: 'Completada', tono: 'pos' },
  failed: { label: 'Falló', tono: 'neg' },
  cancelled: { label: 'Reemplazada', tono: 'neutral', strike: true },
  retrying: { label: 'Reintentando', tono: 'warn' },
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
    <section className="mt-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Plan de ejecución</h2>
        <Badge tono={est.tono}>{est.label}</Badge>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        La estrategia que el Financial Engineering propone para coordinar cobros, pagos y líneas — en orden y
        respetando qué depende de qué. El recálculo es automático; ejecutarla requiere tu aprobación.
      </p>

      {vigente.cambios && <Cambios cambios={vigente.cambios} />}

      {acciones.length === 0 ? (
        <Card padding="md" className="text-[13px] text-faint">
          El plan no propone acciones en este horizonte: la caja cubre lo que viene.
        </Card>
      ) : (
        <Card padding="none">
          <ol>
            {acciones.map((a, i) => {
              const t = estadoPorTitulo.get(a.descripcion)
              const v = VERBO[a.tipo]
              const tarea = t ? (ESTADO_TAREA[t.state] ?? { label: t.state, tono: 'neutral' as Tono }) : null
              return (
                <li key={a.id} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
                  <div className="w-12 shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-faint">{dia(a.fecha)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`text-[13px] font-medium ${v.punta}`}>{v.label}</span>
                      <span className="truncate text-[13px] text-ink-soft">{a.descripcion.replace(/^\S+\s/, '')}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">{a.motivo}</div>
                    {a.dependencias.length > 0 && (
                      <div className="mt-1 text-[11px] text-faint">
                        Depende de {a.dependencias.map((d) => dia(idAFecha.get(d) ?? '')).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {a.costo_financiero > 0 && <div className="text-[11px] text-warn">cuesta {money(a.costo_financiero)}</div>}
                    {ejecutado && t && tarea ? (
                      <div className="mt-0.5">
                        <Badge tono={tarea.tono} className={tarea.strike ? 'line-through' : ''}>{tarea.label}</Badge>
                        {t.agent_slug && <div className="mt-0.5 text-[10px] text-faint">{AGENTE[t.agent_slug] ?? t.agent_slug} IA</div>}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-faint">{a.requiere_aprobacion ? 'requiere aprobación' : ''}</div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {vigente.estado === 'pendiente_ejecucion' && acciones.length > 0 && (
        <Aprobar horizonte={vigente.horizonte} calculadoEn={vigente.calculado_en} n={acciones.length} />
      )}
      {vigente.estado === 'autorizado' && (
        <Callout tono="info" className="mt-4">
          Plan aprobado. El OS está creando el trabajo para los especialistas — en un momento vas a ver el estado de cada acción.
        </Callout>
      )}
    </section>
  )
}

function Cambios({ cambios }: { cambios: CambiosPlan }) {
  const total = cambios.agregadas.length + cambios.eliminadas.length + cambios.reprogramadas.length
  if (total === 0) return null
  return (
    <div className="mb-4 rounded-control border border-line bg-surface-quiet px-3 py-2 text-[12px] text-muted">
      <span className="font-medium text-ink-soft">Cambió respecto del plan anterior:</span>{' '}
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
        <p className="text-[12px] text-muted">
          Al aprobar se crean {n} tarea{n > 1 ? 's' : ''} para los especialistas. No se ejecutan pagos ni operaciones bancarias:
          los movimientos de dinero siguen requiriendo tu aprobación aparte.
        </p>
        <button
          type="submit"
          disabled={pending || state.ok}
          className="shrink-0 rounded-control bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? 'Aprobando…' : state.ok ? 'Aprobado ✓' : 'Aprobar y convertir en trabajo'}
        </button>
      </div>
      {state.error && <p className="mt-2 text-[12px] text-neg">{state.error}</p>}
      {state.mensaje && <p className="mt-2 text-[12px] text-muted">{state.mensaje}</p>}
    </form>
  )
}
