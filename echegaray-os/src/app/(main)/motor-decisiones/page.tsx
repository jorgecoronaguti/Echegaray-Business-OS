import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { construirAnalisisMultidisciplinario } from '@/features/motor-decisiones/types'
import type { DatoTrazado } from '@/shared/types/datoTrazado'

async function loadMotorDecisionesData() {
  try {
    const supabase = await createClient()
    const datos = await getDashboardDatosFuente(supabase)
    return { datos }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { datos: { data: null, error } as const }
  }
}

function CampoImpacto({ etiqueta, dato }: { etiqueta: string; dato: DatoTrazado<string> }) {
  if (dato.valor == null) return null
  return (
    <p className="text-sm">
      <span className="font-medium">{etiqueta} </span>
      <span className={dato.naturaleza === 'inferido' || dato.naturaleza === 'estimado' ? 'text-amber-700' : ''}>
        {dato.valor}
      </span>
      <span className="ml-1 text-xs text-gray-400">({dato.naturaleza})</span>
    </p>
  )
}

export default async function MotorDecisionesPage() {
  const { datos } = await loadMotorDecisionesData()

  const pageError = datos.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const alertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const analisis = alertas.map((a) => ({ alerta: a, analisis: construirAnalisisMultidisciplinario(a) }))

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Motor de Decisiones</h1>
        <p className="mt-2 text-gray-600">
          HECHO → CONTEXTO → CAUSA → IMPACTOS → RIESGO → ALTERNATIVAS → RECOMENDACIÓN → CONFIANZA → ACCIÓN, para cada
          situación material que ya detecta el Dashboard — Track B / B5. No fabrica hallazgos nuevos, arma el
          razonamiento multidisciplinario sobre los que ya existen.
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
        <section data-testid="motor-decisiones-section" className="space-y-4">
          {analisis.length === 0 && <p className="text-gray-500">Sin situaciones materiales para analizar hoy.</p>}
          {analisis.map(({ alerta, analisis: a }) => (
            <div key={alerta.id} className="rounded border p-4" data-testid="analisis-multidisciplinario">
              <p className="font-semibold">{a.hecho}</p>
              <p className="mt-1 text-sm text-gray-600">{a.contexto}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">Causa: </span>
                {a.causa}
              </p>

              <div className="mt-2 space-y-1">
                <CampoImpacto etiqueta="Impacto operativo:" dato={a.impactoOperativo} />
                <CampoImpacto etiqueta="Impacto económico:" dato={a.impactoEconomico} />
                <CampoImpacto etiqueta="Impacto financiero:" dato={a.impactoFinanciero} />
                <CampoImpacto etiqueta="Impacto contractual:" dato={a.impactoContractual} />
              </div>

              <p className="mt-2 text-sm text-red-800">
                <span className="font-medium">Riesgo: </span>
                {a.riesgo}
              </p>

              <div className="mt-2">
                <p className="text-sm font-medium">Alternativas:</p>
                <ul className="list-disc pl-5 text-sm text-gray-700">
                  {a.alternativas.map((alt) => (
                    <li key={alt}>{alt}</li>
                  ))}
                </ul>
              </div>

              <p className="mt-2 text-sm">
                <span className="font-medium">Recomendación ({a.confianza}): </span>
                {a.recomendacion}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                <span className="font-medium">Skills activadas: </span>
                {a.skillsActivadas.join(', ')}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
