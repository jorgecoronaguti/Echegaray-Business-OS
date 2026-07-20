import { createClient } from '@/lib/supabase/server'
import { getScorecard } from '@/features/scorecard/services/scorecardService'

export const dynamic = 'force-dynamic'

// SCORECARD FINANCIERO Y CALENDARIO DE COBROS Y PAGOS.
//
// Lee SUPABASE, no el Google Sheet. La pantalla anterior fallaba con "sheets: 400" porque intentaba
// leer la planilla desde el server: además de romperse, ataba la web a una credencial de Google.
// Todo lo que se muestra acá ya está replicado (cobranza, costos_obra, nomina_por_mes).
//
// REGLA DE LA PANTALLA: un dato y una estimación NUNCA se ven iguales. Un cobro con fecha esperada
// se muestra punteado y en gris; uno cobrado, sólido. Decidir sobre un cobro que todavía no entró
// creyendo que entró es el error más caro que puede inducir un tablero.

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const fecha = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

function Tarjeta({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: 'ok' | 'alerta' | 'critico' }) {
  const color = tono === 'critico' ? 'text-red-700' : tono === 'alerta' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{valor}</div>
      {detalle ? <div className="mt-1 text-xs text-slate-500">{detalle}</div> : null}
    </div>
  )
}

export default async function Page() {
  const supabase = await createClient()
  const s = await getScorecard(supabase)

  if (s.error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-semibold">Scorecard financiero</h1>
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          No pude leer los datos: {s.error}
        </p>
      </main>
    )
  }

  const maxBarra = Math.max(1, ...s.semanas.map((w) => Math.max(w.cobros, w.pagos)))

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <h1 className="text-xl font-semibold">Scorecard financiero</h1>
        <p className="text-sm text-slate-500">
          Cobros y pagos desde Supabase. Lo punteado es fecha esperada, no plata que entró.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tarjeta titulo="Cobrado" valor={money(s.cobrado)} detalle="facturas con fecha de cobro real" />
        <Tarjeta titulo="Por cobrar" valor={money(s.porCobrar)} detalle="emitido sin cobrar" tono={s.porCobrar > 0 ? 'alerta' : 'ok'} />
        <Tarjeta titulo="A pagar en 30 días" valor={money(s.porPagar)} tono="alerta" />
        <Tarjeta
          titulo="Neto proyectado 12 semanas"
          valor={money(s.neto)}
          tono={s.neto < 0 ? 'critico' : 'ok'}
          detalle={s.neto < 0 ? 'faltan pesos en el horizonte' : 'el horizonte cierra'}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          Calendario de cobros y pagos — próximas 12 semanas
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Semana</th>
                <th className="p-2 text-right">Cobros</th>
                <th className="p-2 text-right">Pagos</th>
                <th className="p-2 text-right">Neto</th>
                <th className="p-2 text-right">Acumulado</th>
                <th className="p-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {s.semanas.map((w) => (
                <tr key={w.desde} className="border-t border-slate-100">
                  <td className="p-2 whitespace-nowrap">{fecha(w.desde)}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700">{w.cobros ? money(w.cobros) : '—'}</td>
                  <td className="p-2 text-right tabular-nums text-red-700">{w.pagos ? money(w.pagos) : '—'}</td>
                  <td className={`p-2 text-right tabular-nums ${w.neto < 0 ? 'text-red-700' : 'text-slate-900'}`}>{money(w.neto)}</td>
                  <td className={`p-2 text-right font-medium tabular-nums ${w.acumulado < 0 ? 'text-red-700' : 'text-slate-900'}`}>{money(w.acumulado)}</td>
                  <td className="p-2">
                    <div className="flex h-3 items-center gap-px">
                      <div className="flex w-1/2 justify-end">
                        <div className="h-3 rounded-l bg-red-400" style={{ width: `${(w.pagos / maxBarra) * 100}%` }} />
                      </div>
                      <div className="flex w-1/2">
                        <div className="h-3 rounded-r bg-emerald-500" style={{ width: `${(w.cobros / maxBarra) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Egresos por área</h2>
          <ul className="space-y-1 text-sm">
            {s.porArea.map((a) => (
              <li key={a.area} className="flex justify-between border-b border-slate-100 py-1">
                <span>{a.nombre ?? a.area}</span>
                <span className="tabular-nums">{money(a.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Costo de nómina por mes</h2>
          <ul className="space-y-1 text-sm">
            {s.nomina.map((n) => (
              <li key={n.mes} className="flex justify-between border-b border-slate-100 py-1">
                <span className={n.esEstimacion ? 'text-slate-400 italic' : ''}>
                  {n.mes.slice(0, 7)}{n.esEstimacion ? ' · estimado' : ''}
                </span>
                <span className={`tabular-nums ${n.esEstimacion ? 'text-slate-400 italic' : ''}`}>
                  {money(n.jornales + n.cargas)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Próximos movimientos</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[620px] text-sm">
            <tbody>
              {s.proximos.map((m, i) => (
                <tr key={`${m.fecha}-${i}`} className="border-t border-slate-100">
                  <td className="p-2 whitespace-nowrap text-slate-500">{fecha(m.fecha)}</td>
                  <td className="p-2">{m.contraparte ?? '—'}</td>
                  <td className="p-2 text-slate-500">{m.concepto ?? ''}</td>
                  <td className={`p-2 text-right tabular-nums ${m.monto < 0 ? 'text-red-700' : 'text-emerald-700'} ${m.confirmado ? '' : 'italic opacity-70'}`}>
                    {money(m.monto)}{m.confirmado ? '' : ' · esperado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
