import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { getBacklogAutonomo } from '@/features/backlog-autonomo/services/backlogAutonomoService'
import { construirRutinaDiaria, construirRutinaSemanal } from '@/features/rutinas-proactivas/types'
import type { ResultadoRutina, SeccionRutina } from '@/features/rutinas-proactivas/types'

async function loadRutinasData() {
  try {
    const supabase = await createClient()
    const [datos, acciones, backlog] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getBacklogAutonomo(supabase),
    ])
    return { datos, acciones, backlog }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { datos: failed, acciones: failed, backlog: failed }
  }
}

const RESULTADO_BADGE: Record<ResultadoRutina, string> = {
  sin_novedad: 'bg-gray-100 text-gray-600',
  observacion: 'bg-blue-100 text-blue-800',
  recomendacion: 'bg-amber-100 text-amber-800',
}

const RESULTADO_LABEL: Record<ResultadoRutina, string> = {
  sin_novedad: 'Sin novedad',
  observacion: 'Observación',
  recomendacion: 'Recomendación',
}

function TablaRutina({ secciones }: { secciones: SeccionRutina[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {secciones.map((s) => (
        <li key={s.titulo} className="rounded border p-3" data-testid="rutina-seccion">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{s.titulo}</p>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${RESULTADO_BADGE[s.resultado]}`}>
              {RESULTADO_LABEL[s.resultado]} {s.cantidad > 0 && `(${s.cantidad})`}
            </span>
          </div>
          {s.detalle.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
              {s.detalle.slice(0, 5).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

export default async function RutinasPage() {
  const { datos, acciones, backlog } = await loadRutinasData()

  const pageError = datos.error ?? acciones.error ?? backlog.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const alertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const diaria = construirRutinaDiaria(alertas, acciones.data ?? [])
  const semanal = construirRutinaSemanal(alertas, backlog.data ?? [])

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Rutinas Proactivas</h1>
        <p className="mt-2 text-gray-600">
          Qué mostraría la rutina si corriera ahora — Track B / B7. Solo sobre dominios con datos confiables (ver
          catálogo de preguntas). La ejecución realmente automática (sin abrir esta página) requiere una decisión de
          scheduling y queda en el backlog autónomo.
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
        <section data-testid="rutinas-section" className="space-y-8">
          <div>
            <h2 className="text-xl font-semibold">Diaria</h2>
            <TablaRutina secciones={diaria} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Semanal</h2>
            <TablaRutina secciones={semanal} />
          </div>
        </section>
      )}
    </div>
  )
}
