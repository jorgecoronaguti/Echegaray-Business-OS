import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { alertasPorArea } from '@/features/areas/types'
import { getClasificacionesPendientes } from '@/features/clasificacion-costos/services/clasificacionCostosService'
import { ColaClasificacionCostos } from '@/features/clasificacion-costos/components/ColaClasificacionCostos'
import { getObras } from '@/features/obras/services/obrasService'

async function loadAdministracionData() {
  try {
    const supabase = await createClient()
    const [datos, acciones, clasificaciones, obras] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getClasificacionesPendientes(supabase),
      getObras(supabase),
    ])
    return { datos, acciones, clasificaciones, obras }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { datos: failed, acciones: failed, clasificaciones: failed, obras: failed }
  }
}

export default async function AdministracionPage() {
  const { datos, acciones, clasificaciones, obras } = await loadAdministracionData()
  const pageError = datos.error ?? acciones.error ?? clasificaciones.error ?? obras.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const todasLasAlertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const alertasDelArea = alertasPorArea(todasLasAlertas, 'administracion_finanzas')
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])

  const ejecucionFinanciera = datos.data?.ejecucionFinanciera ?? []
  const totalPendienteCobrar = ejecucionFinanciera.reduce((acc, r) => acc + r.pendiente_cobrar, 0)
  const totalPendienteFacturar = ejecucionFinanciera.reduce((acc, r) => acc + r.pendiente_facturar, 0)

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Administración y Finanzas</h1>
        <p className="mt-2 text-gray-600">
          Obligaciones a pagar, cobranza pendiente y caja — qué vence, qué facturar y qué cobrar en todas las obras.
          Reutiliza Obligaciones (PRP-010), Ejecución Financiera (PRP-007) y Caja (PRP-001), sin cálculos nuevos.
        </p>
        <div className="mt-2 flex gap-3 text-sm">
          <Link href="/obligaciones" className="underline">
            Ir a Obligaciones →
          </Link>
          <Link href="/caja" className="underline">
            Ir a Caja →
          </Link>
          <Link href="/capital-trabajo" className="underline">
            Ir a Capital de Trabajo →
          </Link>
        </div>
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
          <section data-testid="administracion-resumen">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Pendiente de facturar (todas las obras)</dt>
                <dd className="text-lg font-semibold">${totalPendienteFacturar}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Pendiente de cobrar (todas las obras)</dt>
                <dd className="text-lg font-semibold text-amber-700">${totalPendienteCobrar}</dd>
              </div>
            </dl>
          </section>

          <SeccionAlertas
            titulo="Qué requiere atención hoy"
            descripcion="Obligaciones vencidas o próximas, certificados sin facturar/cobrar, tensión de liquidez."
            alertas={alertasDelArea}
            testId="administracion-alertas"
            accionesPorAlertaId={accionesMap}
          />

          <section data-testid="clasificacion-costos-section">
            <h2 className="text-xl font-semibold">Costos sin obra confirmada</h2>
            <p className="mt-1 text-sm text-gray-600">
              Gastos reales de un cliente con más de una obra concurrente, sin tag de obra en la fuente de origen. El
              OS sugiere una obra cuando la evidencia alcanza; si no, pide elegir manualmente en vez de forzar una
              asignación (ver ciclo de Pisos, gap real encontrado el 2026-07-08).
            </p>
            <div className="mt-3">
              <ColaClasificacionCostos pendientes={clasificaciones.data ?? []} obras={obras.data ?? []} />
            </div>
          </section>

          <section data-testid="ejecucion-financiera-cross-obra">
            <h2 className="text-xl font-semibold">Ejecución financiera por obra</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Obra</th>
                  <th className="pr-4">Contratado</th>
                  <th className="pr-4">Certificado</th>
                  <th className="pr-4">Facturado</th>
                  <th className="pr-4">Cobrado</th>
                  <th className="pr-4">% cobrado</th>
                </tr>
              </thead>
              <tbody>
                {ejecucionFinanciera.map((r) => (
                  <tr key={r.obra_id}>
                    <td className="pr-4">
                      <Link href={`/obras/${r.obra_id}`} className="underline">
                        {r.obra_nombre}
                      </Link>
                    </td>
                    <td className="pr-4">${r.monto_contratado}</td>
                    <td className="pr-4">${r.total_certificado}</td>
                    <td className="pr-4">${r.total_facturado}</td>
                    <td className="pr-4">${r.total_cobrado}</td>
                    <td className="pr-4">{r.porcentaje_contrato_cobrado ?? '—'}%</td>
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
