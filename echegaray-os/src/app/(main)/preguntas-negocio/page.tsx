import { createClient } from '@/lib/supabase/server'
import { getPreguntasNegocio } from '@/features/preguntas-negocio/services/preguntasNegocioService'
import { ESTADO_PREGUNTA_LABEL } from '@/features/preguntas-negocio/types'
import type { EstadoPregunta } from '@/features/preguntas-negocio/types'

async function loadPreguntasData() {
  try {
    const supabase = await createClient()
    const preguntas = await getPreguntasNegocio(supabase)
    return { preguntas }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { preguntas: { data: null, error } as const }
  }
}

const ESTADO_BADGE: Record<EstadoPregunta, string> = {
  confiable: 'bg-emerald-100 text-emerald-800',
  parcial: 'bg-amber-100 text-amber-800',
  no_confiable: 'bg-gray-200 text-gray-700',
}

export default async function PreguntasNegocioPage() {
  const { preguntas } = await loadPreguntasData()

  const pageError = preguntas.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = preguntas.data ?? []
  const confiables = lista.filter((p) => p.estado === 'confiable').length

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Catálogo de Preguntas de Negocio</h1>
        <p className="mt-2 text-gray-600">
          Qué puede responder el OS con evidencia hoy, y qué todavía no — {confiables} de {lista.length} preguntas
          confiables. Track B / B2 del Programa de Ejecución Continua.
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

      {preguntas.data && (
        <section data-testid="preguntas-negocio-section" className="space-y-4">
          {lista.map((p) => (
            <div key={p.id} className="rounded border p-4" data-testid="pregunta-negocio-fila">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">{p.pregunta}</p>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[p.estado]}`}>
                  {ESTADO_PREGUNTA_LABEL[p.estado]}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium">Dominio</dt>
                  <dd>{p.dominio}</dd>
                </div>
                <div>
                  <dt className="font-medium">Fuente</dt>
                  <dd>{p.fuente}</dd>
                </div>
                <div>
                  <dt className="font-medium">Método de cálculo</dt>
                  <dd>{p.metodo_calculo}</dd>
                </div>
                {p.gap_bloqueante && (
                  <div>
                    <dt className="font-medium">Gap bloqueante</dt>
                    <dd>{p.gap_bloqueante}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
          {lista.length === 0 && <p className="text-gray-500">Sin preguntas cargadas todavía.</p>}
        </section>
      )}
    </div>
  )
}
