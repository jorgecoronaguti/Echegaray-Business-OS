import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { alertasPorArea } from '@/features/areas/types'
import { estadoOperativoCompra } from '@/features/compras/types'

async function loadComprasData() {
  try {
    const supabase = await createClient()
    const [datos, acciones] = await Promise.all([getDashboardDatosFuente(supabase), getAcciones(supabase)])
    return { datos, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { datos: { data: null, error } as const, acciones: { data: null, error } as const }
  }
}

export default async function ComprasAreaPage() {
  const { datos, acciones } = await loadComprasData()
  const pageError = datos.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const todasLasAlertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const alertasDelArea = alertasPorArea(todasLasAlertas, 'compras_abastecimiento')
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])

  const compras = datos.data?.compras ?? []
  const obras = datos.data?.obras ?? []
  const proveedores = datos.data?.proveedores ?? []
  const obraNombre = (id: string | null) => obras.find((o) => o.id === id)?.nombre ?? 'Sin obra'
  const proveedorNombre = (id: string | null) => proveedores.find((p) => p.id === id)?.nombre ?? 'Sin proveedor'

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Compras y Abastecimiento</h1>
        <p className="mt-2 text-gray-600">
          Todas las compras de todas las obras, en un solo lugar — qué está pendiente de entrega, qué se recibió sin
          costo registrado, qué proveedor concentra retrasos. Reutiliza Compras (PRP-009), sin cálculos nuevos.
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

      {datos.data && (
        <>
          <SeccionAlertas
            titulo="Qué requiere atención hoy"
            descripcion="Compras retrasadas, sin trazabilidad, o pagadas sin recepción confirmada."
            alertas={alertasDelArea}
            testId="compras-area-alertas"
            accionesPorAlertaId={accionesMap}
          />

          <section data-testid="compras-cross-obra">
            <h2 className="text-xl font-semibold">Todas las compras ({compras.length})</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Concepto</th>
                  <th className="pr-4">Obra</th>
                  <th className="pr-4">Proveedor</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">Necesidad</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id}>
                    <td className="pr-4">{c.concepto}</td>
                    <td className="pr-4">
                      {c.obra_id ? (
                        <Link href={`/obras/${c.obra_id}`} className="underline">
                          {obraNombre(c.obra_id)}
                        </Link>
                      ) : (
                        'Sin obra'
                      )}
                    </td>
                    <td className="pr-4">{proveedorNombre(c.proveedor_id)}</td>
                    <td className="pr-4">{estadoOperativoCompra(c)}</td>
                    <td className="pr-4">{c.fecha_necesidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
