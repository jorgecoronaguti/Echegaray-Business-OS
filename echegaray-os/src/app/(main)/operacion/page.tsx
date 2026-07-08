import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObras } from '@/features/obras/services/obrasService'
import { getActividadesSemanalesTodasLasObras } from '@/features/actividades-semanales/services/actividadesSemanalesService'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { construirTableroObras, ordenarTableroObras } from '@/features/obras/types/tableroObras'
import { ESTADO_ECONOMICO_LABEL, ESTADO_ECONOMICO_CLASSNAME } from '@/features/control-economico/types'

// PR UX-1 (grupo de navegación "Operación"): plan semanal y restricciones a través de
// todas las obras, sin entrar obra por obra. Reutiliza actividades_semanales (ya
// existente) -- cero cálculo o tabla nueva.
//
// Ritual semanal de obras (ciclo "operabilidad real", Sección 7): la sección
// "Síntesis por obra" de acá abajo es la base real de una reunión semanal --
// reutiliza el mismo tablero de /obras y el mismo Motor de Observación del Dashboard,
// filtrado por obra, sin fabricar un tercer cálculo.

async function loadOperacion() {
  try {
    const supabase = await createClient()
    const [obras, actividades, datosFuente, acciones] = await Promise.all([
      getObras(supabase),
      getActividadesSemanalesTodasLasObras(supabase),
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
    ])
    return { obras, actividades, datosFuente, acciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { obras: failed, actividades: failed, datosFuente: failed, acciones: failed }
  }
}

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export default async function OperacionPage() {
  const { obras, actividades, datosFuente, acciones } = await loadOperacion()
  const pageError = obras.error ?? actividades.error ?? datosFuente.error ?? acciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const nombrePorObra = new Map((obras.data ?? []).map((o) => [o.id, o.nombre]))
  const enCurso = (actividades.data ?? []).filter((a) => a.estado !== 'cerrada')
  const conRestriccion = enCurso.filter((a) => a.restricciones)

  const tablero =
    obras.data && datosFuente.data
      ? ordenarTableroObras(
          construirTableroObras(
            obras.data,
            datosFuente.data.resumenEconomico,
            datosFuente.data.resumenHH,
            datosFuente.data.ejecucionFinanciera,
            datosFuente.data.actividadesSemanales
          )
        ).filter((o) => o.estado === 'activa' || o.estado === 'contratada' || o.estado === 'pausada')
      : []
  const todasLasAlertas = datosFuente.data ? construirAlertasDashboard(datosFuente.data) : []

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Operación</h1>
        <p className="mt-2 text-gray-600">
          Base real para la reunión semanal de obras: plan, avance, HH, costo, certificación/cobranza, riesgos y
          acciones — por obra, no un volcado de todas las obras juntas.
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

      {actividades.data && (
        <>
          <section data-testid="operacion-sintesis-por-obra">
            <h2 className="text-xl font-semibold">Síntesis semanal por obra</h2>
            <div className="mt-3 space-y-4">
              {tablero.map((o) => {
                const restriccionesObra = conRestriccion.filter((a) => a.obra_id === o.obra_id)
                const riesgosObra = todasLasAlertas.filter((a) => a.obraId === o.obra_id)
                const accionesObra = (acciones.data ?? []).filter(
                  (a) => a.obra_id === o.obra_id && (a.estado === 'pendiente' || a.estado === 'en_curso')
                )
                return (
                  <div key={o.obra_id} className="rounded border p-4" data-testid="operacion-obra-sintesis">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/obras/${o.obra_id}`} className="text-lg font-semibold underline">
                        {o.obra_nombre}
                      </Link>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_ECONOMICO_CLASSNAME[o.estadoEconomico]}`}>
                        {ESTADO_ECONOMICO_LABEL[o.estadoEconomico]}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-gray-500">Avance</dt>
                        <dd className="font-medium">{o.avanceFisicoPromedio != null ? `${o.avanceFisicoPromedio.toFixed(0)}%` : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">HH real/est.</dt>
                        <dd className="font-medium">{o.hhReal} / {o.hhEstimada ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Costo real</dt>
                        <dd className="font-medium">{money(o.costoRealAcumulado)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Pendiente de cobrar</dt>
                        <dd className="font-medium">{money(o.pendienteCobrar)}</dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-sm">
                      <span className="font-medium">Restricciones abiertas: </span>
                      {restriccionesObra.length === 0
                        ? 'Ninguna'
                        : restriccionesObra.map((a) => `${a.actividad}: ${a.restricciones}`).join(' · ')}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Riesgos: </span>
                      {riesgosObra.length === 0 ? 'Ninguno detectado' : riesgosObra.map((a) => a.titulo).join(' · ')}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Acciones abiertas: </span>
                      {accionesObra.length === 0 ? 'Ninguna' : accionesObra.map((a) => a.titulo).join(' · ')}
                    </p>
                  </div>
                )
              })}
              {tablero.length === 0 && <p className="text-sm text-gray-500">Sin obras activas/pausadas/contratadas.</p>}
            </div>
          </section>

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
