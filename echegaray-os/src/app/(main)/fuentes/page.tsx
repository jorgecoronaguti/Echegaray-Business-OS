import { createClient } from '@/lib/supabase/server'
import { getFuentesDatos } from '@/features/fuentes-datos/services/fuentesDatosService'
import { ESTADO_FUENTE_LABEL, fuentesCriticasConProblema } from '@/features/fuentes-datos/types'
import type { EstadoFuente, Criticidad } from '@/features/fuentes-datos/types'

async function loadFuentesData() {
  try {
    const supabase = await createClient()
    const fuentes = await getFuentesDatos(supabase)
    return { fuentes }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { fuentes: { data: null, error } as const }
  }
}

const ESTADO_BADGE: Record<EstadoFuente, string> = {
  actualizado: 'bg-emerald-100 text-emerald-800',
  atrasado: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  cobertura_parcial: 'bg-amber-100 text-amber-800',
  conflicto: 'bg-red-100 text-red-800',
  fuente_no_disponible: 'bg-gray-200 text-gray-700',
}

const CRITICIDAD_BADGE: Record<Criticidad, string> = {
  alta: 'bg-red-50 text-red-700 border border-red-200',
  media: 'bg-amber-50 text-amber-700 border border-amber-200',
  baja: 'bg-gray-50 text-gray-600 border border-gray-200',
}

export default async function FuentesPage() {
  const { fuentes } = await loadFuentesData()

  const pageError = fuentes.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = fuentes.data ?? []
  const criticasConProblema = fuentesCriticasConProblema(lista)

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Fuentes de Datos</h1>
        <p className="mt-2 text-gray-600">
          Continuidad Operacional de Datos y Conocimiento — Track B / B8. Catálogo vivo de las fuentes reales de la
          empresa (Drive, sistemas externos, capacidades del OS) con su frescura y cobertura. El Motor de Decisiones
          debe reflejar cuándo una respuesta se apoya en una fuente atrasada o parcial.
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

      {fuentes.data && (
        <section data-testid="fuentes-datos-section" className="space-y-6">
          {criticasConProblema.length > 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-4 text-red-900" data-testid="fuentes-criticas-alerta">
              <p className="font-semibold">{criticasConProblema.length} fuente(s) crítica(s) con problema de frescura</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {criticasConProblema.map((f) => (
                  <li key={f.id}>
                    {f.nombre} — {ESTADO_FUENTE_LABEL[f.estado]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-500">
                  <th className="py-2 pr-4">Fuente</th>
                  <th className="py-2 pr-4">Proceso</th>
                  <th className="py-2 pr-4">Área</th>
                  <th className="py-2 pr-4">Criticidad</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Mecanismo</th>
                  <th className="py-2 pr-4">Destino en OS</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id} className="border-b align-top" data-testid="fuente-fila">
                    <td className="py-2 pr-4 font-medium">
                      {f.drive_url ? (
                        <a href={f.drive_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                          {f.nombre}
                        </a>
                      ) : (
                        f.nombre
                      )}
                      {f.notas && <p className="mt-1 text-xs font-normal text-gray-500">{f.notas}</p>}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{f.proceso_negocio}</td>
                    <td className="py-2 pr-4 text-gray-700">{f.area}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${CRITICIDAD_BADGE[f.criticidad]}`}>
                        {f.criticidad}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[f.estado]}`}>
                        {ESTADO_FUENTE_LABEL[f.estado]}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{f.mecanismo_integracion}</td>
                    <td className="py-2 pr-4 text-gray-700">{f.destino_supabase ?? '—'}</td>
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
