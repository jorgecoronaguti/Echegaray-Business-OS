import { createClient } from '@/lib/supabase/server'
import { getObras } from '@/features/obras/services/obrasService'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { AccionForm } from '@/features/acciones/components/AccionForm'
import { AccionesList } from '@/features/acciones/components/AccionesList'
import { AREAS_OS, AREA_LABEL } from '@/features/areas/types'
import type { EstadoAccion } from '@/features/acciones/types'
import { ESTADO_ACCION_LABEL } from '@/features/acciones/types'

async function loadAccionesData() {
  try {
    const supabase = await createClient()
    const [obras, acciones] = await Promise.all([getObras(supabase), getAcciones(supabase)])
    return { obras, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { obras: failed, acciones: failed }
  }
}

const ESTADOS_ACTIVOS: EstadoAccion[] = ['pendiente', 'en_curso']

export default async function AccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; estado?: string }>
}) {
  const { area: areaFiltro, estado: estadoFiltro } = await searchParams
  const { obras, acciones } = await loadAccionesData()

  const pageError = obras.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  let lista = acciones.data ?? []
  if (areaFiltro) lista = lista.filter((a) => a.area === areaFiltro)
  lista = estadoFiltro
    ? lista.filter((a) => a.estado === estadoFiltro)
    : lista.filter((a) => ESTADOS_ACTIVOS.includes(a.estado))

  const conteoPorEstado: Record<EstadoAccion, number> = { pendiente: 0, en_curso: 0, resuelta: 0, descartada: 0 }
  for (const a of acciones.data ?? []) conteoPorEstado[a.estado]++

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Centro de Acción</h1>
        <p className="mt-2 text-gray-600">
          Todo lo que requiere una decisión hoy, sea generado por una alerta del sistema o creado manualmente —
          con responsable, fecha límite y resolución, para no depender de la memoria de nadie.
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

      <section data-testid="acciones-resumen-estado">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(ESTADO_ACCION_LABEL) as EstadoAccion[]).map((e) => (
            <div key={e} className="rounded border p-3 text-center">
              <dt className="text-xs uppercase text-gray-500">{ESTADO_ACCION_LABEL[e]}</dt>
              <dd className="text-2xl font-bold">{conteoPorEstado[e]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section data-testid="filtros-acciones" className="flex flex-wrap items-center gap-2 text-sm">
        <a href="/acciones" className={`rounded border px-2 py-1 ${!areaFiltro ? 'bg-black text-white' : ''}`}>
          Todas las áreas
        </a>
        {AREAS_OS.map((a) => (
          <a
            key={a}
            href={`/acciones?area=${a}`}
            className={`rounded border px-2 py-1 ${areaFiltro === a ? 'bg-black text-white' : ''}`}
          >
            {AREA_LABEL[a]}
          </a>
        ))}

        <span className="mx-2 text-gray-300">|</span>

        {(['', ...Object.keys(ESTADO_ACCION_LABEL)] as (EstadoAccion | '')[]).map((e) => {
          const params = new URLSearchParams()
          if (areaFiltro) params.set('area', areaFiltro)
          if (e) params.set('estado', e)
          const query = params.toString()
          return (
            <a
              key={e || 'activas'}
              href={query ? `/acciones?${query}` : '/acciones'}
              className={`rounded border px-2 py-1 ${estadoFiltro === e || (!estadoFiltro && e === '') ? 'bg-gray-700 text-white' : ''}`}
            >
              {e ? ESTADO_ACCION_LABEL[e] : 'Activas'}
            </a>
          )
        })}
      </section>

      <section data-testid="accion-form-section">
        <h2 className="text-xl font-semibold">Crear acción manual</h2>
        <AccionForm obras={obras.data ?? []} />
      </section>

      <section data-testid="acciones-section">
        <h2 className="text-xl font-semibold">
          Acciones {estadoFiltro ? `— ${ESTADO_ACCION_LABEL[estadoFiltro as EstadoAccion] ?? estadoFiltro}` : 'activas (pendiente / en curso)'}
        </h2>
        <AccionesList acciones={lista} />
      </section>
    </div>
  )
}
