import { createClient } from '@/lib/supabase/server'
import { getScorecardDominios } from '@/features/scorecard/services/scorecardService'
import { dominioMasAtrasado, dominiosConIncrementoActivo } from '@/features/scorecard/types'

async function loadScorecardData() {
  try {
    const supabase = await createClient()
    const dominios = await getScorecardDominios(supabase)
    return { dominios }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { dominios: { data: null, error } as const }
  }
}

function BarraNivel({ nivel }: { nivel: number }) {
  return (
    <div className="flex w-28 gap-[2px]" data-testid="scorecard-gauge">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-sm ${i < nivel ? 'bg-amber-600' : 'bg-gray-200'}`} />
      ))}
    </div>
  )
}

export default async function ScorecardPage() {
  const { dominios } = await loadScorecardData()

  const pageError = dominios.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = dominios.data ?? []
  const atrasado = dominioMasAtrasado(lista)
  const activos = dominiosConIncrementoActivo(lista)

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Scorecard de Madurez (0–10)</h1>
        <p className="mt-2 text-gray-600">
          Programa de Ejecución Continua. Escala: 0 inexistente → 10 mejora continua. No se considera ningún dominio
          crítico &quot;completo&quot; por tener una pantalla o tabla — el objetivo de largo plazo es 10/10 en todos.
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

      {dominios.data && (
        <section data-testid="scorecard-section" className="space-y-6">
          {atrasado && (
            <div className="rounded border border-gray-300 bg-gray-50 p-4" data-testid="dominio-mas-atrasado">
              <p className="text-sm text-gray-600">Dominio más atrasado</p>
              <p className="text-lg font-semibold">
                {atrasado.dominio} — nivel {atrasado.nivel_actual}
              </p>
            </div>
          )}

          {activos.length > 0 && (
            <div className="rounded border border-blue-200 bg-blue-50 p-4" data-testid="incrementos-activos">
              <p className="font-semibold">Incrementos activos ahora</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {activos.map((d) => (
                  <li key={d.id}>
                    <strong>{d.dominio}:</strong> {d.incremento_activo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="py-2 pr-4">Dominio</th>
                  <th className="py-2 pr-4">Nivel</th>
                  <th className="py-2 pr-4">Evidencia</th>
                  <th className="py-2 pr-4">Bloqueante</th>
                  <th className="py-2 pr-4">Criterio de avance</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id} className="border-b align-top" data-testid="scorecard-fila">
                    <td className="py-2 pr-4 font-medium">{d.dominio}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{d.nivel_actual}</span>
                        <BarraNivel nivel={d.nivel_actual} />
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{d.evidencia}</td>
                    <td className="py-2 pr-4 text-gray-700">{d.bloqueante}</td>
                    <td className="py-2 pr-4 text-gray-700">{d.criterio_objetivo_avance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
