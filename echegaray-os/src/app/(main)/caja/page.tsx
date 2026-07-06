import { createClient } from '@/lib/supabase/server'
import {
  getClientes,
  getObras,
  getCuentasFinancieras,
  getProveedores,
} from '@/features/fundacion/services/fundacionService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { MovimientoCajaForm } from '@/features/flujo-caja/components/MovimientoCajaForm'

async function loadCajaData() {
  try {
    const supabase = await createClient()
    const [clientes, obras, cuentas, proveedores, movimientos] = await Promise.all([
      getClientes(supabase),
      getObras(supabase),
      getCuentasFinancieras(supabase),
      getProveedores(supabase),
      getMovimientosCaja(supabase),
    ])
    return { clientes, obras, cuentas, proveedores, movimientos }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { clientes: failed, obras: failed, cuentas: failed, proveedores: failed, movimientos: failed }
  }
}

export default async function CajaPage() {
  const { clientes, obras, cuentas, proveedores, movimientos } = await loadCajaData()

  const pageError =
    clientes.error ?? obras.error ?? cuentas.error ?? proveedores.error ?? movimientos.error
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
