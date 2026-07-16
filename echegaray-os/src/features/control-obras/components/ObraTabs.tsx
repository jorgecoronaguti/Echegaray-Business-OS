'use client'

import { useState } from 'react'
import { pedidoPendiente, type ObraDetalle } from '../services/controlObrasService'

type Tab = 'herramientas' | 'pedidos' | 'movimientos'

function fecha(f: string | null): string {
  if (!f) return '—'
  const d = new Date(f)
  return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ObraTabs({ detalle }: { detalle: ObraDetalle }) {
  const [tab, setTab] = useState<Tab>('herramientas')
  const tabs: { id: Tab; label: string; count: number }[] = [
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
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="divide-y divide-gray-100">
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

function Vacio({ texto }: { texto: string }) {
  return <div className="px-4 py-10 text-center text-sm text-gray-400">{texto}</div>
}
