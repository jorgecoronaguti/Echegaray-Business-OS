'use client'

import { useState } from 'react'
import type { DiaCalendario, Movimiento } from '@/features/flujo-caja/services/calendarioReader'

// Calendario del flujo de dinero en dos vistas complementarias:
//  1) Grilla mensual (overview): cada día con su neto y sus movimientos compactos.
//  2) Agenda: TODOS los días, cada uno con el detalle preciso de cada concepto
//     (tipo · quién · concepto · monto exacto). Se ven los conceptos de cada día sin
//     tener que clickear. Tocar un día en la grilla salta a su tarjeta en la agenda.

const TIPO: Record<Movimiento['tipo'], { label: string; dot: string; chip: string }> = {
  cobro: { label: 'Cobro', dot: 'bg-green-500', chip: 'bg-green-100 text-green-800' },
  pago: { label: 'Pago', dot: 'bg-red-500', chip: 'bg-red-100 text-red-800' },
  cheque: { label: 'Cheque', dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-800' },
  tarjeta: { label: 'Tarjeta', dot: 'bg-purple-500', chip: 'bg-purple-100 text-purple-800' },
}

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const compacto = (n: number) => {
  const a = Math.abs(n)
  const s = n < 0 ? '−' : '+'
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1).replace('.', ',')}M`
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`
  return `${s}$${num.format(a)}`
}

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const mesLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

export function CalendarioFlujo({ dias, hoyIso }: { dias: DiaCalendario[]; hoyIso: string }) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const meses = [...new Set(dias.map((d) => d.fecha.slice(0, 7)))].sort()
  const [sel, setSel] = useState<string | null>(null)

  if (meses.length === 0) return null

  const irADia = (iso: string) => {
    setSel(iso)
    document.getElementById(`dia-${iso}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="space-y-6">
      {/* 1) GRILLA MENSUAL (overview) */}
      {meses.map((key) => {
        const [y, m] = key.split('-').map(Number)
        const diasEnMes = new Date(y, m, 0).getDate()
        const primerDiaSemana = (new Date(y, m - 1, 1).getDay() + 6) % 7
        const celdas: (number | null)[] = [
          ...Array(primerDiaSemana).fill(null),
          ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
        ]
        while (celdas.length % 7 !== 0) celdas.push(null)

        return (
          <div key={key} className="overflow-x-auto rounded-lg border bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-900 capitalize">{mesLabel(key)}</h3>
            <div className="grid min-w-[700px] grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  {d}
                </div>
              ))}
              {celdas.map((dnum, i) => {
                if (dnum === null) return <div key={i} className="min-h-20 rounded bg-gray-50/40" />
                const iso = `${key}-${String(dnum).padStart(2, '0')}`
                const dia = porFecha.get(iso)
                const esHoy = iso === hoyIso
                if (!dia) {
                  return (
                    <div
                      key={i}
                      className={`min-h-20 rounded border p-1 text-[11px] text-gray-300 ${esHoy ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}
                    >
                      {dnum}
                    </div>
                  )
                }
                const negProy = dia.acumulado < 0
                const extra = dia.movimientos.length - 3
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => irADia(iso)}
                    className={`min-h-20 rounded border p-1 text-left transition ${negProy ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'} hover:border-blue-400 hover:ring-1 hover:ring-blue-300 ${esHoy ? 'outline outline-1 outline-blue-400' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-700">{dnum}</span>
                      <span className={`text-[10px] font-bold tabular-nums ${dia.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {compacto(dia.neto)}
                      </span>
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {dia.movimientos.slice(0, 3).map((mv, j) => (
                        <div key={j} className="flex items-center gap-1 text-[10px] leading-tight">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO[mv.tipo].dot}`} />
                          <span className="min-w-0 flex-1 truncate text-gray-600">{mv.quien}</span>
                        </div>
                      ))}
                      {extra > 0 && <div className="pl-2.5 text-[9px] text-blue-600">+{extra} más</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* 2) AGENDA — conceptos de cada día, precisos, sin clickear */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-gray-900 uppercase">Detalle día por día</h3>
        <div className="space-y-3">
          {dias.map((dia) => (
            <div
              id={`dia-${dia.fecha}`}
              key={dia.fecha}
              className={`scroll-mt-4 rounded-lg border bg-white p-3 shadow-sm ${sel === dia.fecha ? 'border-blue-400 ring-2 ring-blue-200' : dia.acumulado < 0 ? 'border-red-200' : ''}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-900 capitalize">{fechaLarga(dia.fecha)}</h4>
                <div className="text-xs text-gray-500 tabular-nums">
                  neto{' '}
                  <span className={`font-semibold ${dia.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {pesos.format(dia.neto)}
                  </span>
                  {' · '}saldo proy.{' '}
                  <span className={`font-semibold ${dia.acumulado < 0 ? 'text-red-700' : 'text-gray-800'}`}>
                    {pesos.format(dia.acumulado)}
                  </span>
                </div>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {dia.movimientos.map((mv, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-2 align-top">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${TIPO[mv.tipo].chip}`}>
                            {TIPO[mv.tipo].label}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 align-top font-medium text-gray-900">{mv.quien}</td>
                        <td className="py-1.5 pr-2 align-top text-xs text-gray-500">{mv.detalle || '—'}</td>
                        <td className={`py-1.5 pl-2 text-right align-top font-semibold tabular-nums whitespace-nowrap ${mv.monto > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                          {mv.monto > 0 ? '+' : ''}
                          {pesos.format(mv.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
