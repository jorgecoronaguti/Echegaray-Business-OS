import { createClient } from '@/lib/supabase/server'
import { getCapitalTrabajo } from '@/features/capital-trabajo/services/capitalTrabajoService'
import { calcularAlertasConcentracion } from '@/features/capital-trabajo/types'
import type { ExposicionContraparte } from '@/features/capital-trabajo/types'

async function loadCapitalTrabajoData() {
  try {
    const supabase = await createClient()
    const capital = await getCapitalTrabajo(supabase)
    return { capital }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { capital: { data: null, error } as const }
  }
}

function formatoMoneda(monto: number): string {
  return monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

function TablaExposicion({ titulo, items }: { titulo: string; items: ExposicionContraparte[] }) {
  return (
    <div>
      <h3 className="font-medium text-gray-800">{titulo}</h3>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr>
            <th className="pr-4">Contraparte</th>
            <th className="pr-4">Monto pendiente</th>
            <th className="pr-4">% del total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className={it.porcentajeDelTotal > 0.4 ? 'bg-amber-50' : undefined} data-testid="exposicion-fila">
              <td className="pr-4">{it.nombre}</td>
              <td className="pr-4">{formatoMoneda(it.montoPendiente)}</td>
              <td className="pr-4 font-medium">
                {(it.porcentajeDelTotal * 100).toFixed(0)}%{it.porcentajeDelTotal > 0.4 && ' ⚠️'}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="pr-4 text-gray-500" colSpan={3}>
                Sin datos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default async function CapitalTrabajoPage() {
  const { capital } = await loadCapitalTrabajoData()

  const pageError = capital.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const alertasConcentracion = capital.data ? calcularAlertasConcentracion(capital.data) : []

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Capital de Trabajo y Exposición Financiera</h1>
        <p className="mt-2 text-gray-600">
          Cuentas por cobrar/pagar pendientes y concentración por cliente y proveedor — PRP-015, Fase 2 (primer
          incremento). No incluye todavía exposición por obra ni necesidad de financiamiento cuantificada (depende de
          costos_reales, hoy sin datos).
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

      {capital.data && (
        <section data-testid="capital-trabajo-section" className="space-y-6">
          <div className="flex gap-8">
            <div>
              <p className="text-sm text-gray-600">Cuentas por cobrar pendientes</p>
              <p className="text-xl font-semibold">{formatoMoneda(capital.data.totalCxC)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cuentas por pagar pendientes</p>
              <p className="text-xl font-semibold">{formatoMoneda(capital.data.totalCxP)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Capital de trabajo neto</p>
              <p className={`text-xl font-semibold ${capital.data.capitalTrabajoNeto < 0 ? 'text-red-700' : ''}`}>
                {formatoMoneda(capital.data.capitalTrabajoNeto)}
              </p>
            </div>
          </div>

          {alertasConcentracion.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="alertas-concentracion">
              <p className="font-semibold">Concentración detectada</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {alertasConcentracion.map((a) => (
                  <li key={`${a.tipo}-${a.contraparte.id}`}>{a.mensaje}</li>
                ))}
              </ul>
            </div>
          )}

          <TablaExposicion titulo="Exposición por cliente (CxC pendiente)" items={capital.data.exposicionPorCliente} />
          <TablaExposicion titulo="Exposición por proveedor (CxP pendiente)" items={capital.data.exposicionPorProveedor} />
        </section>
      )}
    </div>
  )
}
