import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObras } from '@/features/obras/services/obrasService'
import { getActividadesSemanalesTodasLasObras } from '@/features/actividades-semanales/services/actividadesSemanalesService'

// PR UX-1 (grupo de navegación "Operación"): plan semanal y restricciones a través de
// todas las obras, sin entrar obra por obra. Reutiliza actividades_semanales (ya
// existente) -- cero cálculo o tabla nueva. Vista mínima real, no un módulo completo
// de logística/materiales todavía (eso depende de fuentes que siguen sin relevar,
// ver Pedidos de Materiales / AppSheet en backlog_autonomo).

async function loadOperacion() {
  try {
    const supabase = await createClient()
    const [obras, actividades] = await Promise.all([
      getObras(supabase),
      getActividadesSemanalesTodasLasObras(supabase),
    ])
    return { obras, actividades }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { obras: failed, actividades: failed }
  }
}

export default async function OperacionPage() {
  const { obras, actividades } = await loadOperacion()
  const pageError = obras.error ?? actividades.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const nombrePorObra = new Map((obras.data ?? []).map((o) => [o.id, o.nombre]))
  const enCurso = (actividades.data ?? []).filter((a) => a.estado !== 'cerrada')
  const conRestriccion = enCurso.filter((a) => a.restricciones)

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Operación</h1>
        <p className="mt-2 text-gray-600">Plan semanal y restricciones de todas las obras en curso.</p>
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

      {actividades.data && (
        <>
          <section data-testid="operacion-restricciones">
            <h2 className="text-xl font-semibold">Restricciones abiertas ({conRestriccion.length})</h2>
            {conRestriccion.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin restricciones informadas en actividades no cerradas.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {conRestriccion.map((a) => (
                  <li key={a.id} className="rounded border p-2" data-testid="operacion-restriccion-fila">
                    <span className="font-medium">{nombrePorObra.get(a.obra_id) ?? a.obra_id}</span> — {a.actividad}:{' '}
                    {a.restricciones}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section data-testid="operacion-plan-semanal">
            <h2 className="text-xl font-semibold">Plan semanal ({enCurso.length})</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase">
                  <th className="pr-4 py-2">Obra</th>
                  <th className="pr-4 py-2">Actividad</th>
                  <th className="pr-4 py-2">Responsable</th>
                  <th className="pr-4 py-2">Estado</th>
                  <th className="pr-4 py-2">Avance objetivo</th>
                </tr>
              </thead>
              <tbody>
                {enCurso.map((a) => (
                  <tr key={a.id} className="border-b" data-testid="operacion-actividad-fila">
                    <td className="pr-4 py-2">
                      <Link href={`/obras/${a.obra_id}`} className="underline">
                        {nombrePorObra.get(a.obra_id) ?? a.obra_id}
                      </Link>
                    </td>
                    <td className="pr-4 py-2">{a.actividad}</td>
                    <td className="pr-4 py-2">{a.responsable}</td>
                    <td className="pr-4 py-2">{a.estado === 'planificada' ? 'Planificada' : 'En curso'}</td>
                    <td className="pr-4 py-2">{a.avance_objetivo != null ? `${a.avance_objetivo}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="flex gap-4 text-sm">
            <Link href="/equipos" className="font-medium text-blue-700 underline">
              Ver Equipos →
            </Link>
            <Link href="/personas" className="font-medium text-blue-700 underline">
              Ver Personas →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
