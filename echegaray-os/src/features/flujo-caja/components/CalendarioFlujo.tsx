'use client'

import { useState } from 'react'
import type { DiaCalendario, Movimiento } from '@/features/flujo-caja/services/calendarioReader'

// Calendario interactivo del flujo de dinero. Cada celda-día lista SUS movimientos
// (tipo + quién + monto exacto), no solo un contador. Al seleccionar un día, el panel
// de detalle muestra el desglose completo y preciso, con el saldo proyectado del día.

const TIPO: Record<Movimiento['tipo'], { label: string; dot: string; text: string; chip: string }> = {
  cobro: { label: 'Cobro', dot: 'bg-green-500', text: 'text-green-700', chip: 'bg-green-100 text-green-800' },
  pago: { label: 'Pago', dot: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-100 text-red-800' },
  cheque: { label: 'Cheque', dot: 'bg-orange-500', text: 'text-orange-700', chip: 'bg-orange-100 text-orange-800' },
  tarjeta: { label: 'Tarjeta', dot: 'bg-purple-500', text: 'text-purple-700', chip: 'bg-purple-100 text-purple-800' },
}

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
// Monto exacto sin símbolo, con signo, para las celdas (más angosto pero preciso).
const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const montoCelda = (n: number) => `${n > 0 ? '+' : '−'}${num.format(Math.abs(n))}`

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function mesLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function CalendarioFlujo({ dias, hoyIso }: { dias: DiaCalendario[]; hoyIso: string }) {
  const porFecha = new Map<string, DiaCalendario>()
  for (const d of dias) porFecha.set(d.fecha, d)
  const meses = [...new Set(dias.map((d) => d.fecha.slice(0, 7)))].sort()
  const [sel, setSel] = useState<string | null>(dias[0]?.fecha ?? null)
  const diaSel = sel ? porFecha.get(sel) : null

  if (meses.length === 0) return null

  return (
    <div className="space-y-4">
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
            <div className="grid min-w-[720px] grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  {d}
                </div>
              ))}
              {celdas.map((dnum, i) => {
                if (dnum === null) return <div key={i} className="min-h-24 rounded bg-gray-50/40" />
                const iso = `${key}-${String(dnum).padStart(2, '0')}`
                const dia = porFecha.get(iso)
                const esHoy = iso === hoyIso
                const esSel = iso === sel
                if (!dia) {
                  return (
                    <div
                      key={i}
                      className={`min-h-24 rounded border p-1 text-[11px] text-gray-300 ${esHoy ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}
                    >
                      {dnum}
                    </div>
                  )
                }
                const negProy = dia.acumulado < 0
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSel(iso)}
                    className={`min-h-24 rounded border p-1 text-left transition ${negProy ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'} ${esSel ? 'ring-2 ring-blue-500' : 'hover:border-blue-300'} ${esHoy ? 'outline outline-1 outline-blue-400' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-700">{dnum}</span>
                      <span className={`text-[10px] font-bold tabular-nums ${dia.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {montoCelda(dia.neto)}
                      </span>
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {dia.movimientos.map((mv, j) => (
                        <div key={j} className="flex items-center gap-1 text-[10px] leading-tight">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO[mv.tipo].dot}`} />
                          <span className="min-w-0 flex-1 truncate text-gray-600">{mv.quien}</span>
                          <span className={`shrink-0 tabular-nums ${mv.monto > 0 ? 'text-green-700' : 'text-gray-700'}`}>
                            {montoCelda(mv.monto)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-0.5 text-[9px] tabular-nums ${negProy ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                      saldo {montoCelda(dia.acumulado)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Panel de detalle preciso del día seleccionado */}
      {diaSel && (
        <div className="rounded-lg border-2 border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-gray-900 capitalize">{fechaLarga(diaSel.fecha)}</h3>
            <div className="text-xs text-gray-500 tabular-nums">
              neto del día <span className={`font-semibold ${diaSel.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>{pesos.format(diaSel.neto)}</span>
              {' · '}saldo proyectado{' '}
              <span className={`font-semibold ${diaSel.acumulado < 0 ? 'text-red-700' : 'text-gray-800'}`}>{pesos.format(diaSel.acumulado)}</span>
            </div>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] text-gray-400 uppercase">
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 font-medium">Quién</th>
                <th className="py-1 pr-2 font-medium">Concepto</th>
                <th className="py-1 pl-2 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {diaSel.movimientos.map((mv, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TIPO[mv.tipo].chip}`}>{TIPO[mv.tipo].label}</span>
                  </td>
                  <td className="py-1.5 pr-2 font-medium text-gray-900">{mv.quien}</td>
                  <td className="py-1.5 pr-2 text-xs text-gray-500">{mv.detalle || '—'}</td>
                  <td className={`py-1.5 pl-2 text-right font-semibold tabular-nums ${mv.monto > 0 ? 'text-green-700' : 'text-gray-900'}`}>
                    {mv.monto > 0 ? '+' : ''}
                    {pesos.format(mv.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">Tocá cualquier día del calendario para ver su desglose.</p>
        </div>
      )}
    </div>
  )
}
