import {
  leerCalendario,
  SHEET_URL,
  type Movimiento,
} from '@/features/flujo-caja/services/calendarioReader'
import { CargarSaldoForm } from '@/features/flujo-caja/components/CargarSaldoForm'
import { CalendarioMensual } from '@/features/flujo-caja/components/CalendarioMensual'

// Calendario de cobros y pagos — la web muestra lo que hay que cobrar y pagar,
// día por día, con el saldo proyectado acumulado. Fuente única: el Sheet real
// "Flujo de Caja - Cash Flow" (la operación sigue viviendo ahí).

export const dynamic = 'force-dynamic'

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const TIPO_BADGE: Record<Movimiento['tipo'], { label: string; clase: string }> = {
  cobro: { label: 'COBRO', clase: 'bg-green-100 text-green-800' },
  pago: { label: 'PAGO', clase: 'bg-red-100 text-red-800' },
  cheque: { label: 'CHEQUE', clase: 'bg-orange-100 text-orange-800' },
  tarjeta: { label: 'TARJETA', clase: 'bg-purple-100 text-purple-800' },
}

function fechaLarga(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function FilaMovimiento({ m }: { m: Movimiento }) {
  const badge = TIPO_BADGE[m.tipo]
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${badge.clase}`}>
          {badge.label}
        </span>
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900">{m.quien}</span>
          {m.detalle && <span className="ml-2 truncate text-xs text-gray-500">{m.detalle}</span>}
        </div>
      </div>
      <span
        className={`text-sm font-semibold whitespace-nowrap tabular-nums ${m.monto > 0 ? 'text-green-700' : 'text-gray-900'}`}
      >
        {m.monto > 0 ? '+' : ''}
        {pesos.format(m.monto)}
      </span>
    </div>
  )
}

export default async function FlujoCajaPage() {
  const cal = await leerCalendario()

  if ('error' in cal) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">📅 Calendario de cobros y pagos</h1>
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">La conexión con el Sheet no está configurada en este entorno.</p>
          <p className="mt-2">{cal.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">📅 Calendario de cobros y pagos</h1>
        <div className="text-xs text-gray-500">
          Fuente:{' '}
          <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline hover:text-gray-700">
            Sheet «Flujo de Caja»
          </a>{' '}
          · leído {cal.leidoEn}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-3">
          <div className="text-[11px] text-gray-500 uppercase">Saldo disponible hoy</div>
          <div
            className={`mt-1 text-lg font-bold tabular-nums ${(cal.saldoHoy ?? 0) < 0 ? 'text-red-700' : 'text-gray-900'}`}
          >
            {cal.saldoHoy === null ? 'sin dato' : pesos.format(cal.saldoHoy)}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-[11px] text-gray-500 uppercase">Por cobrar</div>
          <div className="mt-1 text-lg font-bold text-green-700 tabular-nums">{pesos.format(cal.totalCobros)}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-[11px] text-gray-500 uppercase">Por pagar</div>
          <div className="mt-1 text-lg font-bold text-red-700 tabular-nums">{pesos.format(cal.totalPagos)}</div>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <div className="text-[11px] text-gray-500 uppercase">Neto pendiente</div>
          <div
            className={`mt-1 text-lg font-bold tabular-nums ${cal.totalCobros + cal.totalPagos < 0 ? 'text-red-700' : 'text-green-700'}`}
          >
            {pesos.format(cal.totalCobros + cal.totalPagos)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <CargarSaldoForm />
      </div>

      {cal.vencidos.length > 0 && (
        <section className="mt-6 rounded-lg border-2 border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-bold text-red-800 uppercase">
            ⚠️ Vencido y sin ejecutar ({cal.vencidos.length})
          </h2>
          <p className="mt-1 text-xs text-red-700">
            Fecha pasada y sigue sin cobrarse/pagarse — resolver o recalendarizar en el Sheet.
          </p>
          <div className="mt-2 divide-y divide-red-200">
            {cal.vencidos.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-red-700 tabular-nums">
                  {new Date(`${m.fecha}T12:00:00`).toLocaleDateString('es-AR')}
                </span>
                <div className="min-w-0 flex-1">
                  <FilaMovimiento m={m} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vista principal: CALENDARIO mensual (grilla) */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900 uppercase">Calendario</h2>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-green-200 bg-green-50" /> día positivo</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-red-300 bg-red-50" /> saldo proy. negativo</span>
            <span className="flex items-center gap-1"><span className="rounded bg-green-600 px-1 text-[9px] font-bold text-white">n</span> cobros</span>
            <span className="flex items-center gap-1"><span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">n</span> pagos</span>
          </div>
        </div>
        <CalendarioMensual dias={cal.dias} hoyIso={new Date().toISOString().slice(0, 10)} />
        {cal.dias.length === 0 && (
          <p className="text-sm text-gray-500">No hay cobros ni pagos futuros con fecha cargada en el Sheet.</p>
        )}
      </section>

      {/* Detalle día por día (debajo del calendario, para trazabilidad total) */}
      {cal.dias.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold text-gray-900 uppercase">Detalle día por día</h2>
          <div className="space-y-4">
            {cal.dias.map((dia) => (
              <div key={dia.fecha} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900 capitalize">{fechaLarga(dia.fecha)}</h3>
                  <div className="text-xs whitespace-nowrap text-gray-500 tabular-nums">
                    neto {pesos.format(dia.neto)} · saldo proy.{' '}
                    <span className={dia.acumulado < 0 ? 'font-semibold text-red-700' : 'font-semibold text-gray-800'}>
                      {pesos.format(dia.acumulado)}
                    </span>
                  </div>
                </div>
                <div className="mt-1 divide-y divide-gray-100">
                  {dia.movimientos.map((m, i) => (
                    <FilaMovimiento key={i} m={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 space-y-1 text-xs text-gray-500">
        <p>
          <span className="font-semibold text-gray-700">Certeza:</span> los cobros del calendario concilian exactamente con
          «Cuentas por Cobrar» del Sheet ({pesos.format(cal.totalCobros)}). La lógica de pagos usa el mismo criterio
          anti-doble-conteo del CF Semanal (cobros no cobrados; compras pendientes/proyectadas; cheques y tarjeta no
          debitados por su fecha real).
        </p>
        <p>
          El saldo proyectado parte del saldo de banco (pestaña Caja) y acumula solo los movimientos con fecha cargada.
          Los vencidos NO están sumados al proyectado hasta que tengan fecha nueva. La carga y corrección de datos se
          hace en el Sheet.
        </p>
      </div>
    </div>
  )
}
