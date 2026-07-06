import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientes, getCuentasFinancieras, getProveedores } from '@/features/fundacion/services/fundacionService'
import { getObraById } from '@/features/obras/services/obrasService'
import { getMovimientosCajaPorObra } from '@/features/flujo-caja/services/movimientosCajaService'

async function loadObraDetalle(id: string) {
  try {
    const supabase = await createClient()
    const [obra, clientes, cuentas, proveedores, movimientos] = await Promise.all([
      getObraById(supabase, id),
      getClientes(supabase),
      getCuentasFinancieras(supabase),
      getProveedores(supabase),
      getMovimientosCajaPorObra(supabase, id),
    ])
    return { obra, clientes, cuentas, proveedores, movimientos }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { obra: failed, clientes: failed, cuentas: failed, proveedores: failed, movimientos: failed }
  }
}

export default async function ObraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { obra, clientes, cuentas, proveedores, movimientos } = await loadObraDetalle(id)

  const pageError = obra.error ?? clientes.error ?? cuentas.error ?? proveedores.error ?? movimientos.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  if (!pageError && !obra.data) {
    notFound()
  }

  const clienteNombre = clientes.data?.find((c) => c.id === obra.data?.cliente_id)?.nombre ?? '—'
  const cuentaNombre = (id: string | null) => cuentas.data?.find((c) => c.id === id)?.nombre ?? '—'
  const proveedorNombre = (id: string | null) => proveedores.data?.find((p) => p.id === id)?.nombre ?? '—'

  return (
    <div className="min-h-screen space-y-8 p-8">
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

      {obra.data && (
        <>
          <div data-testid="obra-detalle">
            <h1 className="text-3xl font-bold">{obra.data.nombre}</h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Cliente</dt>
                <dd>{clienteNombre}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Estado</dt>
                <dd>{obra.data.estado}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Monto contratado</dt>
                <dd>${obra.data.monto_contratado}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha de inicio</dt>
                <dd>{obra.data.fecha_inicio}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha objetivo</dt>
                <dd>{obra.data.fecha_fin_objetivo}</dd>
              </div>
            </dl>
          </div>

          <section data-testid="movimientos-obra-section">
            <h2 className="text-xl font-semibold">Movimientos de caja de esta obra</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Fecha esperada</th>
                  <th className="pr-4">Tipo</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Monto</th>
                  <th className="pr-4">Cuenta financiera</th>
                  <th className="pr-4">Proveedor</th>
                  <th className="pr-4">Concepto</th>
                </tr>
              </thead>
              <tbody>
                {(movimientos.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="pr-4">{m.fecha_esperada}</td>
                    <td className="pr-4">{m.tipo}</td>
                    <td className="pr-4">{m.estado}</td>
                    <td className="pr-4">${m.monto}</td>
                    <td className="pr-4">{cuentaNombre(m.cuenta_financiera_id)}</td>
                    <td className="pr-4">{proveedorNombre(m.proveedor_id)}</td>
                    <td className="pr-4">{m.concepto}</td>
                  </tr>
                ))}
                {(movimientos.data ?? []).length === 0 && !pageError && (
                  <tr>
                    <td colSpan={7} className="pt-2 text-gray-500">
                      Sin movimientos registrados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
