import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones, accionesPorAlertaOrigen } from '@/features/acciones/services/accionesService'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'
import { alertasPorArea } from '@/features/areas/types'

async function loadPersonasData() {
  try {
    const supabase = await createClient()
    const [datos, acciones] = await Promise.all([getDashboardDatosFuente(supabase), getAcciones(supabase)])
    return { datos, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { datos: { data: null, error } as const, acciones: { data: null, error } as const }
  }
}

export default async function PersonasPage() {
  const { datos, acciones } = await loadPersonasData()
  const pageError = datos.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const todasLasAlertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const alertasDelArea = alertasPorArea(todasLasAlertas, 'personas_productividad')
  const accionesMap = accionesPorAlertaOrigen(acciones.data ?? [])

  const resumenHH = datos.data?.resumenHH ?? []

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Personas y Productividad</h1>
        <p className="mt-2 text-gray-600">
          HH real contra HH estimada, obra por obra — no es un módulo de RRHH ni liquidación de sueldos, es
          productividad de obra. Reutiliza HH y Productividad (PRP-008), sin cálculos nuevos.
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
            descripcion="Desvíos de HH contra lo estimado, concentración anormal y obras sin registro reciente."
            alertas={alertasDelArea}
            testId="personas-alertas"
            accionesPorAlertaId={accionesMap}
          />

          <section data-testid="hh-cross-obra">
            <h2 className="text-xl font-semibold">HH por obra</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="pr-4">Obra</th>
                  <th className="pr-4">HH estimada</th>
                  <th className="pr-4">HH real</th>
                  <th className="pr-4">Desvío %</th>
                  <th className="pr-4">Última semana registrada</th>
                </tr>
              </thead>
              <tbody>
                {resumenHH.map((r) => (
                  <tr key={r.obra_id}>
                    <td className="pr-4">
                      <Link href={`/obras/${r.obra_id}`} className="underline">
                        {r.obra_nombre}
                      </Link>
                    </td>
                    <td className="pr-4">{r.hh_estimada ?? '—'}</td>
                    <td className="pr-4">{r.hh_real_acumulada}</td>
                    <td className="pr-4">{r.desvio_porcentual ?? '—'}</td>
                    <td className="pr-4">{r.ultima_fecha_registro ?? '—'}</td>
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
