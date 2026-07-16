'use client'

import { useState } from 'react'
import { pedidoPendiente, type AvanceObra, type ObraDetalle } from '../services/controlObrasService'
import type { CostosObra } from '../services/costosObraService'

type Tab = 'economico' | 'avance' | 'costos' | 'herramientas' | 'pedidos' | 'movimientos'

function fecha(f: string | null): string {
  if (!f) return '—'
  const d = new Date(f)
  return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function ObraTabs({ detalle, avance, costos }: { detalle: ObraDetalle; avance: AvanceObra | null; costos: CostosObra }) {
  const [tab, setTab] = useState<Tab>('economico')
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'economico', label: 'Económico' },
    { id: 'avance', label: 'Avance', count: avance?.estructurado ? avance.actividades : 0 },
    { id: 'costos', label: 'Costos', count: costos.comprobantes },
    { id: 'herramientas', label: 'Herramientas', count: detalle.herramientas.length },
    { id: 'pedidos', label: 'Pedidos', count: detalle.pedidos.length },
    { id: 'movimientos', label: 'Movimientos', count: detalle.movimientos.length },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id ? 'border-b-2 border-gray-900 text-gray-900' : 'border-b-2 border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
        {tab === 'economico' && (
          <EconomicoPanel avance={avance} costos={costos} pedidosPendientes={detalle.pedidos.filter((p) => pedidoPendiente(p.estado)).length} />
        )}

        {tab === 'avance' && <AvancePanel avance={avance} />}

        {tab === 'costos' && <CostosPanel costos={costos} />}

        {tab === 'herramientas' &&
          (detalle.herramientas.length === 0 ? (
            <Vacio texto="No hay herramientas asignadas a esta obra." />
          ) : (
            detalle.herramientas.map((h) => (
              <Row key={h.id_herramienta} icon="🔧" titulo={h.nombre} sub={h.origen ? `origen: ${h.origen}` : ''} />
            ))
          ))}

        {tab === 'pedidos' &&
          (detalle.pedidos.length === 0 ? (
            <Vacio texto="No hay pedidos de material para esta obra." />
          ) : (
            detalle.pedidos.map((p) => {
              const pend = pedidoPendiente(p.estado)
              return (
                <Row
                  key={p.id_pedido}
                  icon="📦"
                  titulo={[p.material, p.cantidad ? `· ${p.cantidad}` : ''].filter(Boolean).join(' ') || 'Pedido'}
                  sub={fecha(p.fecha)}
                  pill={p.estado ? { texto: p.estado, tono: pend ? 'amber' : 'ok' } : undefined}
                />
              )
            })
          ))}

        {tab === 'movimientos' &&
          (detalle.movimientos.length === 0 ? (
            <Vacio texto="No hay movimientos de herramientas hacia esta obra." />
          ) : (
            detalle.movimientos.map((m) => (
              <Row
                key={m.id_movimiento}
                icon="↔"
                titulo={m.herramienta_nombre || 'Herramienta'}
                sub={[m.destino ? `→ ${m.destino}` : '', m.responsable || ''].filter(Boolean).join(' · ')}
                stamp={fecha(m.fecha)}
              />
            ))
          ))}
      </div>
    </div>
  )
}

function Row({
  icon,
  titulo,
  sub,
  pill,
  stamp,
}: {
  icon: string
  titulo: string
  sub?: string
  pill?: { texto: string; tono: 'ok' | 'amber' }
  stamp?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{titulo}</div>
        {sub && <div className="truncate text-xs text-gray-500">{sub}</div>}
      </div>
      {pill && (
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            pill.tono === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {pill.texto}
        </span>
      )}
      {stamp && <span className="shrink-0 text-xs text-gray-400">{stamp}</span>}
    </div>
  )
}

function barra(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-sky-500'
  if (pct > 0) return 'bg-amber-400'
  return 'bg-gray-300'
}

function AvancePanel({ avance }: { avance: AvanceObra | null }) {
  if (!avance || !avance.estructurado) {
    return (
      <Vacio
        texto={
          avance?.motivo
            ? `Avance físico sin cargar: ${avance.motivo}.`
            : 'Esta obra todavía no tiene avance físico cargado en el tracker de Drive.'
        }
      />
    )
  }
  const prom = avance.avance_promedio ?? 0
  return (
    <div>
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-gray-100">
          <span className="text-lg font-bold tabular-nums text-gray-900">{prom}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">Avance físico</div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full ${barra(prom)}`} style={{ width: `${Math.min(prom, 100)}%` }} />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {avance.completadas}/{avance.actividades} actividades completas · fuente: tracker de Drive
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100">
        {avance.detalle.map((a, i) => (
          <div key={`${a.codigo ?? ''}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-12 shrink-0 text-xs tabular-nums text-gray-400">{a.codigo ?? '—'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-900">{a.actividad}</div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${barra(a.pct)}`} style={{ width: `${Math.min(a.pct, 100)}%` }} />
              </div>
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-700">{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EconomicoPanel({
  avance,
  costos,
  pedidosPendientes,
}: {
  avance: AvanceObra | null
  costos: CostosObra
  pedidosPendientes: number
}) {
  const avancePct = avance?.estructurado && avance.avance_promedio != null ? avance.avance_promedio : null
  return (
    <div>
      <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-3">
        <LineaEco
          titulo="Presupuesto de contrato"
          valor={null}
          nota="Sin contrato cargado"
          detalle="Se completa cuando se cargue el contrato de la obra."
        />
        <LineaEco
          titulo="Comprometido"
          valor={null}
          nota={`${pedidosPendientes} pedido${pedidosPendientes === 1 ? '' : 's'} pendiente${pedidosPendientes === 1 ? '' : 's'}`}
          detalle="Los pedidos de material aún no tienen monto; se valoriza al integrar precios."
        />
        <LineaEco
          titulo="Ejecutado (costo real)"
          valor={money(costos.total)}
          nota={`${costos.comprobantes} comprobante${costos.comprobantes === 1 ? '' : 's'} de ARCA`}
          detalle={costos.comprobantes === 0 ? 'Asigná comprobantes a esta obra para ver el costo real.' : 'Suma de comprobantes de ARCA atribuidos a esta obra.'}
          fuerte
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="text-sm text-gray-600">
          {avancePct != null ? (
            <>
              Avance físico <span className="font-semibold text-gray-900">{avancePct}%</span>. El cruce físico vs
              económico (¿el % ejecutado acompaña al % de obra?) se activa cuando haya presupuesto de contrato.
            </>
          ) : (
            <>El avance físico de esta obra todavía no está cargado en el tracker.</>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Para completar el cuadro económico falta cargar el <strong>contrato</strong> (monto, plazo, condiciones de
        cobro) y valorizar los pedidos. Mientras tanto, solo el <strong>ejecutado</strong> es un número real; el resto
        se muestra como pendiente, no se estima.
      </div>
    </div>
  )
}

function LineaEco({
  titulo,
  valor,
  nota,
  detalle,
  fuerte = false,
}: {
  titulo: string
  valor: string | null
  nota: string
  detalle: string
  fuerte?: boolean
}) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{titulo}</div>
      <div className={`mt-1 tabular-nums ${fuerte ? 'text-2xl font-bold text-gray-900' : 'text-lg font-semibold text-gray-400'}`}>
        {valor ?? '—'}
      </div>
      <div className="text-xs font-medium text-gray-600">{nota}</div>
      <div className="mt-1 text-[11px] text-gray-400">{detalle}</div>
    </div>
  )
}

function CostosPanel({ costos }: { costos: CostosObra }) {
  if (costos.comprobantes === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-gray-400">
        Todavía no hay costos de ARCA asignados a esta obra.
        <br />
        <a href="/control-obras/costos" className="mt-2 inline-block font-medium text-gray-700 underline hover:text-gray-900">
          Asignar comprobantes a obras →
        </a>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-baseline justify-between px-4 py-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">Costo real (comprobantes ARCA)</div>
          <div className="text-xs text-gray-500">{costos.comprobantes} comprobantes asignados · fuente: ARCA</div>
        </div>
        <div className="text-2xl font-bold tabular-nums text-gray-900">{money(costos.total)}</div>
      </div>
      <div className="border-t border-gray-100">
        {costos.porProveedor.map((p) => (
          <div key={p.cuit || p.proveedor} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-900">{p.proveedor}</div>
              <div className="text-xs text-gray-500">
                {p.comprobantes} comprobante{p.comprobantes === 1 ? '' : 's'}
                {p.cuit ? ` · CUIT ${p.cuit}` : ''}
              </div>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">{money(p.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <div className="px-4 py-10 text-center text-sm text-gray-400">{texto}</div>
}
