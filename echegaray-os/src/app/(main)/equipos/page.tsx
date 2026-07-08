import { createClient } from '@/lib/supabase/server'
import { getEquipos } from '@/features/equipos/services/equiposService'

async function loadEquiposData() {
  try {
    const supabase = await createClient()
    const equipos = await getEquipos(supabase)
    return { equipos }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { equipos: { data: null, error } as const }
  }
}

export default async function EquiposPage() {
  const { equipos } = await loadEquiposData()

  const pageError = equipos.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = equipos.data ?? []

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Equipos y Vehículos</h1>
        <p className="mt-2 text-gray-600">
          Padrón real de flota, sembrado desde la carpeta VEHICULOS de Drive (RTO/cédula/título) — primer dato
          estructurado de este dominio. Utilización y costo por equipo quedan como próximo incremento.
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

      {equipos.data && (
        <section data-testid="equipos-section">
          <ul className="mt-3 space-y-2">
            {lista.map((e) => (
              <li key={e.id} className="rounded border p-3" data-testid="equipo-fila">
                <p className="font-semibold">
                  {e.nombre} {e.patente_o_identificador && `— ${e.patente_o_identificador}`}
                </p>
                <p className="text-xs text-gray-500">
                  {e.tipo} · fuente: {e.fuente_legacy}
                </p>
                {e.notas && <p className="mt-1 text-sm text-gray-600">{e.notas}</p>}
              </li>
            ))}
            {lista.length === 0 && <p className="text-gray-500">Sin equipos cargados todavía.</p>}
          </ul>
        </section>
      )}
    </div>
  )
}
