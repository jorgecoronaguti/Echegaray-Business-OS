import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard, ORDEN_SEVERIDAD } from '@/features/dashboard/types'
import type { SeveridadAlerta } from '@/features/dashboard/types'
import { SeccionAlertas } from '@/features/dashboard/components/SeccionAlertas'

async function loadDashboard() {
  try {
    const supabase = await createClient()
    return await getDashboardDatosFuente(supabase)
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { data: null, error } as const
  }
}

export default async function DashboardPage() {
  const { data: datos, error: pageError } = await loadDashboard()
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const alertas = datos ? construirAlertasDashboard(datos) : []

  const conteoPorSeveridad: Record<SeveridadAlerta, number> = { critica: 0, alta: 0, media: 0, informativa: 0 }
  for (const a of alertas) conteoPorSeveridad[a.severidad]++

  const rankingPrioridades = alertas.slice(0, 10)

  const alertasCajaObligaciones = alertas.filter((a) => a.categoria === 'obligaciones')
  const alertasObrasEnRiesgo = alertas.filter(
    (a) => a.categoria === 'control_economico' || a.categoria === 'actividad_obra'
  )
  const alertasAdicionales = alertas.filter((a) => a.categoria === 'adicionales')
  const alertasEjecucionFinanciera = alertas.filter((a) => a.categoria === 'ejecucion_financiera')
  const alertasHH = alertas.filter((a) => a.categoria === 'hh')
  const alertasCompras = alertas.filter((a) => a.categoria === 'compras')

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Dirección</h1>
        <p className="mt-2 text-gray-600">
          ¿Dónde tengo que intervenir hoy y por qué? — cruza Control Económico, Adicionales, Ejecución Financiera,
          HH, Compras y Obligaciones. No fabrica alertas nuevas: reutiliza las de cada capacidad.
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

      {datos && (
        <>
          <section data-testid="dashboard-resumen-severidad">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(ORDEN_SEVERIDAD) as SeveridadAlerta[]).map((sev) => (
                <div key={sev} className="rounded border p-3 text-center">
                  <dt className="text-xs uppercase text-gray-500">{sev}</dt>
                  <dd className="text-2xl font-bold">{conteoPorSeveridad[sev]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <SeccionAlertas
            titulo="Ranking de prioridades"
            descripcion="Las situaciones más urgentes de todas las capacidades, ordenadas por severidad."
            alertas={rankingPrioridades}
            testId="dashboard-ranking"
          />

          <SeccionAlertas
            titulo="Caja y Obligaciones"
            descripcion="Vencimientos, pagos parciales, tensión de liquidez y concentración de vencimientos."
            alertas={alertasCajaObligaciones}
            testId="dashboard-obligaciones"
          />

          <SeccionAlertas
            titulo="Obras en riesgo"
            descripcion="Margen crítico o en atención, y obras activas sin movimiento reciente registrado."
            alertas={alertasObrasEnRiesgo}
            testId="dashboard-obras-riesgo"
          />

          <SeccionAlertas
            titulo="Adicionales"
            descripcion="Adicionales ejecutados sin cotizar, aprobados sin facturar, facturados sin cobrar."
            alertas={alertasAdicionales}
            testId="dashboard-adicionales"
          />

          <SeccionAlertas
            titulo="Certificación, Facturación y Cobranza"
            descripcion="Certificados pendientes de facturar o cobrar, y obras con baja conversión de contrato a caja."
            alertas={alertasEjecucionFinanciera}
            testId="dashboard-ejecucion-financiera"
          />

          <SeccionAlertas
            titulo="HH y Productividad"
            descripcion="Desvíos de HH contra lo estimado, concentración anormal y obras sin registro reciente."
            alertas={alertasHH}
            testId="dashboard-hh"
          />

          <SeccionAlertas
            titulo="Compras"
            descripcion="Compras retrasadas, sin trazabilidad, o pagadas sin recepción confirmada."
            alertas={alertasCompras}
            testId="dashboard-compras"
          />
        </>
      )}
    </div>
  )
}
