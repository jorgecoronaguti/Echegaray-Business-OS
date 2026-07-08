import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardDatosFuente } from '@/features/dashboard/services/dashboardDataService'
import { construirAlertasDashboard } from '@/features/dashboard/types'
import { construirAnalisisMultidisciplinario } from '@/features/motor-decisiones/types'
import { construirRutinaDiaria, construirRutinaSemanal } from '@/features/rutinas-proactivas/types'
import { getAcciones } from '@/features/acciones/services/accionesService'
import { getBacklogAutonomo } from '@/features/backlog-autonomo/services/backlogAutonomoService'
import { getFuentesDatos } from '@/features/fuentes-datos/services/fuentesDatosService'
import { ESTADO_FUENTE_LABEL, fuentesCriticasConProblema } from '@/features/fuentes-datos/types'
import { TIPO_BACKLOG_LABEL } from '@/features/backlog-autonomo/types'

// PR UX-4: "Operador Digital" consolida en una sola página entendible lo que antes
// eran 3 pantallas técnicas sueltas (Motor de Decisiones, Rutinas, Backlog Autónomo)
// -- qué está observando, qué recomienda, qué backlog generó, qué rutinas corrieron.
// Reutiliza exactamente la misma lógica de cada una (sin recalcular nada); cada
// sección linkea a su página completa para el detalle técnico.

const RESULTADO_LABEL: Record<string, string> = {
  sin_novedad: 'Sin novedad material',
  observacion: 'Observación',
  recomendacion: 'Recomendación',
}

async function loadOperadorDigital() {
  try {
    const supabase = await createClient()
    const [datos, acciones, backlog, fuentes] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getBacklogAutonomo(supabase),
      getFuentesDatos(supabase),
    ])
    return { datos, acciones, backlog, fuentes }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { datos: failed, acciones: failed, backlog: failed, fuentes: failed }
  }
}

export default async function OperadorDigitalPage() {
  const { datos, acciones, backlog, fuentes } = await loadOperadorDigital()
  const pageError = datos.error ?? acciones.error ?? backlog.error ?? fuentes.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const alertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const analisisDestacado = alertas.slice(0, 3).map((a) => ({ alerta: a, analisis: construirAnalisisMultidisciplinario(a) }))
  const rutinaDiaria = datos.data ? construirRutinaDiaria(alertas, acciones.data ?? []) : []
  const rutinaSemanal = datos.data ? construirRutinaSemanal(alertas, backlog.data ?? []) : []
  const backlogAbierto = (backlog.data ?? []).filter((b) => b.estado === 'abierto')
  const fuentesConProblema = fuentesCriticasConProblema(fuentes.data ?? [])

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Operador Digital</h1>
        <p className="mt-2 text-gray-600">
          Qué está observando, investigando, recomendando y proponiendo el OS por su cuenta.
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
        <>
          <section data-testid="operador-digital-preguntar">
            <h2 className="text-xl font-semibold">Preguntarle al OS</h2>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                disabled
                placeholder="Próximo: Motor de Solicitudes — todavía no implementado"
                className="w-full rounded border bg-gray-50 px-3 py-2 text-sm text-gray-400"
              />
              <button disabled className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-400">
                Preguntar
              </button>
            </div>
          </section>

          <section data-testid="operador-digital-recomienda">
            <h2 className="text-xl font-semibold">Qué recomienda</h2>
            {analisisDestacado.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin situaciones materiales para analizar hoy.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {analisisDestacado.map(({ alerta, analisis }) => (
                  <li key={alerta.id} className="rounded border p-3 text-sm" data-testid="operador-digital-recomendacion">
                    <p className="font-semibold">{analisis.hecho}</p>
                    <p className="mt-1 text-gray-600">{analisis.recomendacion}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/motor-decisiones" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver análisis multidisciplinario completo →
            </Link>
          </section>

          <section data-testid="operador-digital-rutinas">
            <h2 className="text-xl font-semibold">Qué corrieron las rutinas</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[...rutinaDiaria, ...rutinaSemanal].map((s) => (
                <div key={s.titulo} className="rounded border p-3 text-sm" data-testid="operador-digital-rutina-fila">
                  <p className="font-medium">{s.titulo}</p>
                  <p className="text-xs text-gray-500">
                    {RESULTADO_LABEL[s.resultado]} ({s.cantidad})
                  </p>
                </div>
              ))}
            </div>
            <Link href="/rutinas" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver rutinas completas →
            </Link>
          </section>

          <section data-testid="operador-digital-backlog">
            <h2 className="text-xl font-semibold">Qué backlog generó ({backlogAbierto.length})</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {backlogAbierto.slice(0, 8).map((b) => (
                <li key={b.id} data-testid="operador-digital-backlog-fila">
                  <span className="text-xs text-gray-400">[{TIPO_BACKLOG_LABEL[b.tipo]}]</span> {b.titulo}
                </li>
              ))}
            </ul>
            <Link href="/backlog-autonomo" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver Backlog Autónomo completo →
            </Link>
          </section>

          <section data-testid="operador-digital-fuentes">
            <h2 className="text-xl font-semibold">Qué no puede responder con confianza hoy</h2>
            {fuentesConProblema.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin fuentes críticas con problemas de frescura.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-amber-800">
                {fuentesConProblema.map((f) => (
                  <li key={f.id}>
                    {f.nombre} — {ESTADO_FUENTE_LABEL[f.estado]}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/fuentes" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver todas las fuentes →
            </Link>
          </section>
        </>
      )}
    </div>
  )
}
