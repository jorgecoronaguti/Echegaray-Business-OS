import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObras } from '@/features/obras/services/obrasService'
import { getPresupuestosTodasLasObras } from '@/features/presupuestos/services/presupuestosService'
import { getPostMortemsTodasLasObras } from '@/features/post-mortem/services/postMortemService'

async function loadComercialData() {
  try {
    const supabase = await createClient()
    const [obras, presupuestos, postMortems] = await Promise.all([
      getObras(supabase),
      getPresupuestosTodasLasObras(supabase),
      getPostMortemsTodasLasObras(supabase),
    ])
    return { obras, presupuestos, postMortems }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { obras: failed, presupuestos: failed, postMortems: failed }
  }
}

export default async function ComercialPage() {
  const { obras, presupuestos, postMortems } = await loadComercialData()
  const pageError = obras.error ?? presupuestos.error ?? postMortems.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const obraNombre = (id: string) => obras.data?.find((o) => o.id === id)?.nombre ?? 'Obra'
  const cierresConAprendizaje = (postMortems.data ?? []).filter(
    (p) => p.estado === 'cerrado' && p.cambios_sugeridos_cotizacion
  )

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Comercial / Presupuestación</h1>
        <p className="mt-2 text-gray-600">
          Presupuestos de todas las obras y el aprendizaje que dejaron las obras ya cerradas para la próxima
          cotización. Reutiliza Presupuesto Base (PRP-003) y Post Mortem (PRP-012), sin cálculos nuevos.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Todavía no existen alertas generadas por esta capacidad (no hay una regla de negocio de cotización
          automatizada hoy) — esta área es de consulta, no de intervención diaria, por ahora.
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

      {presupuestos.data && (
        <section data-testid="presupuestos-cross-obra">
          <h2 className="text-xl font-semibold">Presupuestos ({presupuestos.data.length})</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pr-4">Obra</th>
                <th className="pr-4">Versión</th>
                <th className="pr-4">Estado</th>
                <th className="pr-4">Monto presupuestado</th>
                <th className="pr-4">Margen esperado</th>
              </tr>
            </thead>
            <tbody>
              {presupuestos.data.map((p) => (
                <tr key={p.id}>
                  <td className="pr-4">
                    <Link href={`/obras/${p.obra_id}`} className="underline">
                      {obraNombre(p.obra_id)}
                    </Link>
                  </td>
                  <td className="pr-4">v{p.version}</td>
                  <td className="pr-4">{p.estado}</td>
                  <td className="pr-4">${p.monto_presupuestado}</td>
                  <td className="pr-4">${p.margen_esperado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {postMortems.data && (
        <section data-testid="aprendizajes-cotizacion">
          <h2 className="text-xl font-semibold">Aprendizajes para la próxima cotización ({cierresConAprendizaje.length})</h2>
          {cierresConAprendizaje.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              Todavía no hay obras cerradas con cambios sugeridos de cotización registrados.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {cierresConAprendizaje.map((p) => (
                <li key={p.id} className="rounded border p-3">
                  <p className="font-semibold">
                    <Link href={`/obras/${p.obra_id}`} className="underline">
                      {obraNombre(p.obra_id)}
                    </Link>
                  </p>
                  <p className="mt-1 text-sm">{p.cambios_sugeridos_cotizacion}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
