import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/fundacion/services/fundacionService'
import { getObras } from '@/features/obras/services/obrasService'
import { ObraForm } from '@/features/obras/components/ObraForm'

async function loadObrasData() {
  try {
    const supabase = await createClient()
    const [clientes, obras] = await Promise.all([getClientes(supabase), getObras(supabase)])
    return { clientes, obras }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { clientes: failed, obras: failed }
  }
}

export default async function ObrasPage() {
  const { clientes, obras } = await loadObrasData()

  const pageError = clientes.error ?? obras.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Obras</h1>
        <p className="mt-2 text-gray-600">
          La Obra como unidad económica central del negocio (PRP-002). Cliente, monto contratado,
          fechas y estado — base para Presupuesto, Costos, Compras, HH, Adicionales y Facturación.
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

      <section data-testid="obra-form-section">
        <h2 className="text-xl font-semibold">Contratar obra</h2>
        <ObraForm clientes={clientes.data ?? []} />
      </section>

      <section data-testid="obras-section">
        <h2 className="text-xl font-semibold">Obras</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="pr-4">Nombre</th>
              <th className="pr-4">Estado</th>
              <th className="pr-4">Monto contratado</th>
              <th className="pr-4">Inicio</th>
              <th className="pr-4">Fecha objetivo</th>
            </tr>
          </thead>
          <tbody>
            {(obras.data ?? []).map((o) => (
              <tr key={o.id}>
                <td className="pr-4">
                  <Link href={`/obras/${o.id}`} className="underline">
                    {o.nombre}
                  </Link>
                </td>
                <td className="pr-4">{o.estado}</td>
                <td className="pr-4">${o.monto_contratado}</td>
                <td className="pr-4">{o.fecha_inicio}</td>
                <td className="pr-4">{o.fecha_fin_objetivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
