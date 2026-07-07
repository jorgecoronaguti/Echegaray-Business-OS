import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClientes } from '@/features/fundacion/services/fundacionService'
import { getObras } from '@/features/obras/services/obrasService'
import { ObraForm } from '@/features/obras/components/ObraForm'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { alertasPorArea } from '@/features/areas/types'

async function loadObrasData() {
  try {
    const supabase = await createClient()
    const [clientes, obras, datosDashboard, acciones] = await Promise.all([
      getClientes(supabase),
      getObras(supabase),
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
    ])
    return { clientes, obras, datosDashboard, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { clientes: failed, obras: failed, datosDashboard: failed, acciones: failed }
  }
}

export default async function ObrasPage() {
  const { clientes, obras, datosDashboard, acciones } = await loadObrasData()

  const pageError = clientes.error ?? obras.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const todasLasAlertas = datosDashboard.data ? construirAlertasDashboard(datosDashboard.data) : []
  const alertasDelArea = alertasPorArea(todasLasAlertas, 'obras_produccion')
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])

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

      {datosDashboard.data && (
        <SeccionAlertas
          titulo="Qué requiere atención hoy"
          descripcion="Margen en riesgo, adicionales sin gestionar y obras activas sin movimiento reciente."
          alertas={alertasDelArea}
          testId="obras-area-alertas"
          accionesPorAlertaId={accionesMap}
        />
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
