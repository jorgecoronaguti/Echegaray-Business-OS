import { createClient } from '@/lib/supabase/server'
import {
  getClientes,
  getCuentasFinancieras,
  getProveedores,
} from '@/features/fundacion/services/fundacionService'
import { getObras } from '@/features/obras/services/obrasService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { MovimientoCajaForm } from '@/features/flujo-caja/components/MovimientoCajaForm'
import { getPosicionCajaConsolidada } from '@/features/posicion-caja/services/posicionCajaService'
import type { ComposicionPeriodo } from '@/features/posicion-caja/types'

async function loadCajaData() {
  try {
    const supabase = await createClient()
    const [clientes, obras, cuentas, proveedores, movimientos, posicionCaja] = await Promise.all([
      getClientes(supabase),
      getObras(supabase),
      getCuentasFinancieras(supabase),
      getProveedores(supabase),
      getMovimientosCaja(supabase),
      getPosicionCajaConsolidada(supabase),
    ])
    return { clientes, obras, cuentas, proveedores, movimientos, posicionCaja }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return {
      clientes: failed,
      obras: failed,
      cuentas: failed,
      proveedores: failed,
      movimientos: failed,
      posicionCaja: failed,
    }
  }
}

function formatoMoneda(monto: number): string {
  return monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

function TablaForecast({ titulo, periodos }: { titulo: string; periodos: ComposicionPeriodo[] }) {
  return (
    <div>
      <h3 className="font-medium text-gray-800">{titulo}</h3>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="pr-4">Desde</th>
            <th className="pr-4">Saldo inicial</th>
            <th className="pr-4">Cobros ciertos</th>
            <th className="pr-4">Cobros estimados</th>
            <th className="pr-4">Pagos comprometidos</th>
            <th className="pr-4">Pagos proyectados</th>
            <th className="pr-4">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          {periodos.map((p) => (
            <tr key={p.inicio} className={p.esDeficit ? 'bg-red-50' : undefined} data-testid="periodo-forecast">
              <td className="pr-4">{p.inicio}</td>
              <td className="pr-4">{formatoMoneda(p.saldoInicial)}</td>
              <td className="pr-4">{formatoMoneda(p.cobrosCiertos)}</td>
              <td className="pr-4">{formatoMoneda(p.cobrosEstimados)}</td>
              <td className="pr-4">{formatoMoneda(p.pagosComprometidos)}</td>
              <td className="pr-4">{formatoMoneda(p.pagosProyectadosSueltos)}</td>
              <td className={`pr-4 font-medium ${p.esDeficit ? 'text-red-700' : ''}`}>
                {formatoMoneda(p.saldoFinal)}
                {p.esDeficit && ' ⚠️'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function CajaPage() {
  const { clientes, obras, cuentas, proveedores, movimientos, posicionCaja } = await loadCajaData()

  const pageError =
    clientes.error ?? obras.error ?? cuentas.error ?? proveedores.error ?? movimientos.error ?? posicionCaja.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Caja Operativa</h1>
        <p className="mt-2 text-gray-600">
          Movimientos de caja (cobros y pagos, proyectado vs. real) — PRP-001, Fase 1.
        </p>
      </div>

      {pageError && isAuthError && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No hay sesión autenticada — RLS está bloqueando el acceso correctamente.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}

      {pageError && !isAuthError && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800" data-testid="page-error">
          <p className="font-semibold">Supabase no está configurado o no responde.</p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}

      {posicionCaja.data && (
        <section data-testid="posicion-caja-section" className="space-y-4">
          <h2 className="text-xl font-semibold">Posición de Caja Consolidada (F1)</h2>
          <p className="text-sm text-gray-600">
            Saldo actual: <span className="font-semibold">{formatoMoneda(posicionCaja.data.saldoActual)}</span>.
            Cobertura parcial — ver <code>pr0-linea-base-echegaray.md</code>: CxC, cheques individuales y algunos
            gastos generales todavía no están cargados en su totalidad.
          </p>
          <TablaForecast titulo="Forecast semanal (8 semanas)" periodos={posicionCaja.data.forecastSemanal} />
          <TablaForecast titulo="Forecast mensual (6 meses)" periodos={posicionCaja.data.forecastMensual} />
        </section>
      )}

      <section data-testid="movimiento-form-section">
        <h2 className="text-xl font-semibold">Registrar movimiento</h2>
        <MovimientoCajaForm
          clientes={clientes.data ?? []}
          obras={obras.data ?? []}
          proveedores={proveedores.data ?? []}
          cuentas={cuentas.data ?? []}
        />
      </section>

      <section data-testid="movimientos-section">
        <h2 className="text-xl font-semibold">Movimientos</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pr-4">Fecha esperada</th>
              <th className="pr-4">Fecha real</th>
              <th className="pr-4">Tipo</th>
              <th className="pr-4">Estado</th>
              <th className="pr-4">Monto</th>
              <th className="pr-4">Concepto</th>
            </tr>
          </thead>
          <tbody>
            {(movimientos.data ?? []).map((m) => (
              <tr key={m.id}>
                <td className="pr-4">{m.fecha_esperada}</td>
                <td className="pr-4">{m.fecha_real ?? '—'}</td>
                <td className="pr-4">{m.tipo}</td>
                <td className="pr-4">{m.estado}</td>
                <td className="pr-4">${m.monto}</td>
                <td className="pr-4">{m.concepto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
