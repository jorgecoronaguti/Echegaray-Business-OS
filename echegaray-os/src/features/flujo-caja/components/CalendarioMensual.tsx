import type { DiaCalendario } from '@/features/flujo-caja/services/calendarioReader'

// Calendario mensual (grilla real) del flujo de dinero. Cada celda-día muestra el
// neto del día (verde entra / rojo sale), la cantidad de cobros y pagos, y marca en
// rojo los días con saldo proyectado negativo. Es la vista panorámica; el detalle
// movimiento por movimiento vive debajo, en la lista por día.

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Formato compacto para celdas chicas: $8,3M / $450K / $120. */
function compacto(n: number): string {
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : '+'
  if (abs >= 1e6) return `${signo}$${(abs / 1e6).toFixed(1).replace('.', ',')}M`
  if (abs >= 1e3) return `${signo}$${Math.round(abs / 1e3)}K`
  return `${signo}$${Math.round(abs)}`
}

function mesLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function CalendarioMensual({ dias, hoyIso }: { dias: DiaCalendario[]; hoyIso: string }) {
  // Indexar por fecha y agrupar por mes (YYYY-MM), en orden.
  const porFecha = new Map<string, DiaCalendario>()
  for (const d of dias) porFecha.set(d.fecha, d)
  const meses = [...new Set(dias.map((d) => d.fecha.slice(0, 7)))].sort()

  if (meses.length === 0) return null

  return (
    <div className="space-y-6">
      {meses.map((key) => {
        const [y, m] = key.split('-').map(Number)
        const diasEnMes = new Date(y, m, 0).getDate()
        const primerDiaSemana = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Lunes = 0
        const celdas: (number | null)[] = [
          ...Array(primerDiaSemana).fill(null),
          ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
        ]
        while (celdas.length % 7 !== 0) celdas.push(null)

        return (
          <div key={key} className="rounded-lg border bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-900 capitalize">{mesLabel(key)}</h3>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  {d}
                </div>
              ))}
              {celdas.map((dnum, i) => {
                if (dnum === null) return <div key={i} className="min-h-16 rounded bg-gray-50/40" />
                const iso = `${key}-${String(dnum).padStart(2, '0')}`
                const dia = porFecha.get(iso)
                const esHoy = iso === hoyIso
                if (!dia) {
                  return (
                    <div
                      key={i}
                      className={`min-h-16 rounded border p-1 text-[11px] text-gray-400 ${esHoy ? 'border-blue-400 bg-blue-50' : 'border-gray-100'}`}
                    >
                      {dnum}
                    </div>
                  )
                }
                const cobros = dia.movimientos.filter((mv) => mv.monto > 0).length
                const pagos = dia.movimientos.length - cobros
                const negProy = dia.acumulado < 0
                return (
                  <div
                    key={i}
                    title={`${iso} · neto ${compacto(dia.neto)} · saldo proy. ${compacto(dia.acumulado)}`}
                    className={`min-h-16 rounded border p-1 ${negProy ? 'border-red-300 bg-red-50' : dia.neto >= 0 ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white'} ${esHoy ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-600">{dnum}</span>
                      <span className="flex gap-0.5">
                        {cobros > 0 && (
                          <span className="rounded bg-green-600 px-1 text-[9px] font-bold text-white">{cobros}</span>
                        )}
                        {pagos > 0 && (
                          <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">{pagos}</span>
                        )}
                      </span>
                    </div>
                    <div
                      className={`mt-1 text-[11px] font-bold tabular-nums ${dia.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {compacto(dia.neto)}
                    </div>
                    <div className={`text-[9px] tabular-nums ${negProy ? 'font-semibold text-red-600' : 'text-gray-400'}`}>
                      {compacto(dia.acumulado)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
