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
import { TIPO_BACKLOG_LABEL, ordenarBacklogPorPrioridad } from '@/features/backlog-autonomo/types'
import { getClasificacionesPendientes } from '@/features/clasificacion-costos/services/clasificacionCostosService'

// PR UX-4 + ciclo "operabilidad real" (Sección 12): "Operador Digital" pasa de
// consolidar 3 pantallas técnicas a mostrar en 7 bloques concretos que el sistema
// está trabajando -- Observando / Detectado / Investigando / Recomendando / Trabajo
// creado / Bloqueado / Mejorando el OS. Cero cálculo nuevo: cada bloque reutiliza una
// capacidad ya existente, solo cambia cómo se agrupa y se nombra.

const RESULTADO_LABEL: Record<string, string> = {
  sin_novedad: 'Sin novedad material',
  observacion: 'Observación',
  recomendacion: 'Recomendación',
}

const RUTINAS_PROGRAMADAS = [
  { nombre: 'detectar_senales_criticas_diario', frecuencia: 'Diaria (11:10 UTC)', que_hace: 'Acciones vencidas, fuentes atrasadas, deterioro de margen, exceso de HH, cobranza vencida, pago crítico.' },
  { nombre: 'recalcular_frescura_fuentes_diario', frecuencia: 'Diaria (11:00 UTC)', que_hace: 'Recalcula frescura/cobertura de las 23 fuentes de Drive trackeadas.' },
]

const MEJORA_TIPOS = ['gap_proceso', 'deuda_tecnica', 'mejora_potencial'] as const

async function loadOperadorDigital() {
  try {
    const supabase = await createClient()
    const [datos, acciones, backlog, fuentes, clasificaciones] = await Promise.all([
      getDashboardDatosFuente(supabase),
      getAcciones(supabase),
      getBacklogAutonomo(supabase),
      getFuentesDatos(supabase),
      getClasificacionesPendientes(supabase),
    ])
    return { datos, acciones, backlog, fuentes, clasificaciones }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    const failed = { data: null, error } as const
    return { datos: failed, acciones: failed, backlog: failed, fuentes: failed, clasificaciones: failed }
  }
}

export default async function OperadorDigitalPage() {
  const { datos, acciones, backlog, fuentes, clasificaciones } = await loadOperadorDigital()
  const pageError = datos.error ?? acciones.error ?? backlog.error ?? fuentes.error ?? clasificaciones.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const alertas = datos.data ? construirAlertasDashboard(datos.data) : []
  const analisisDestacado = alertas.slice(0, 3).map((a) => ({ alerta: a, analisis: construirAnalisisMultidisciplinario(a) }))
  const rutinaDiaria = datos.data ? construirRutinaDiaria(alertas, acciones.data ?? []) : []
  const rutinaSemanal = datos.data ? construirRutinaSemanal(alertas, backlog.data ?? []) : []
  const backlogAbierto = ordenarBacklogPorPrioridad((backlog.data ?? []).filter((b) => b.estado === 'abierto'))
  const fuentesConProblema = fuentesCriticasConProblema(fuentes.data ?? [])

  const fechaHace24hs = new Date()
  fechaHace24hs.setDate(fechaHace24hs.getDate() - 1)
  const hace24hs = fechaHace24hs.toISOString()
  const detectadoReciente = backlogAbierto.filter((b) => b.created_at >= hace24hs)

  const backlogSinDato = backlogAbierto.filter((b) => b.confianza === 'sin_dato')
  const clasificacionesSinSugerencia = (clasificaciones.data ?? []).filter((c) => !c.obra_sugerida_id)
  const accionesBloqueadas = (acciones.data ?? []).filter((a) => a.bloqueada)

  const mejorasPropuestas = backlogAbierto.filter((b) => (MEJORA_TIPOS as readonly string[]).includes(b.tipo))

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Operador Digital</h1>
        <p className="mt-2 text-gray-600">
          Qué está observando, detectando, investigando, recomendando, trabajando y mejorando el OS por su cuenta —
          y qué necesita intervención humana.
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

          <section data-testid="operador-digital-observando">
            <h2 className="text-xl font-semibold">Observando</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {RUTINAS_PROGRAMADAS.map((r) => (
                <div key={r.nombre} className="rounded border p-3 text-sm">
                  <p className="font-mono text-xs text-gray-500">{r.nombre}</p>
                  <p className="text-xs text-gray-400">{r.frecuencia}</p>
                  <p className="mt-1">{r.que_hace}</p>
                </div>
              ))}
            </div>
            <Link href="/rutinas" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver rutinas completas →
            </Link>
          </section>

          <section data-testid="operador-digital-detectado">
            <h2 className="text-xl font-semibold">Detectado (últimas 24 horas)</h2>
            {detectadoReciente.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin señales nuevas en las últimas 24hs.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {detectadoReciente.map((b) => (
                  <li key={b.id}>
                    <span className="text-xs text-gray-400">[{TIPO_BACKLOG_LABEL[b.tipo]}]</span> {b.titulo}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section data-testid="operador-digital-investigando">
            <h2 className="text-xl font-semibold">Investigando (gaps y conflictos abiertos)</h2>
            <p className="mt-1 text-sm">
              {backlogSinDato.length} observación(es) sin dato suficiente para confiar todavía, {clasificacionesSinSugerencia.length}{' '}
              gasto(s) sin obra sugerida en la cola de clasificación de costos.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {backlogSinDato.slice(0, 5).map((b) => (
                <li key={b.id}>· {b.titulo}</li>
              ))}
            </ul>
            <Link href="/administracion" className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
              Ver cola de clasificación de costos →
            </Link>
          </section>

          <section data-testid="operador-digital-recomienda">
            <h2 className="text-xl font-semibold">Recomendando</h2>
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
          </section>

          <section data-testid="operador-digital-backlog">
            <h2 className="text-xl font-semibold">Trabajo creado ({backlogAbierto.length})</h2>
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

          <section data-testid="operador-digital-bloqueado">
            <h2 className="text-xl font-semibold">Bloqueado (necesita intervención humana)</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>{accionesBloqueadas.length} acción(es) marcadas como bloqueadas en el Centro de Acción.</li>
              <li>{backlogSinDato.length} observación(es) del backlog sin confianza suficiente para actuar solas.</li>
              <li>{clasificacionesSinSugerencia.length} gasto(s) sin obra sugerida — requieren elegir manualmente.</li>
            </ul>
          </section>

          <section data-testid="operador-digital-mejorando">
            <h2 className="text-xl font-semibold">Mejorando el OS</h2>
            {mejorasPropuestas.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sin mejoras propuestas abiertas.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {mejorasPropuestas.map((b) => (
                  <li key={b.id}>
                    <span className="text-xs text-gray-400">[{TIPO_BACKLOG_LABEL[b.tipo]}]</span> {b.titulo}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Implementado automáticamente este ciclo: 2 rutinas nuevas de detección autónoma (deterioro de margen,
              exceso de HH, cobranza vencida, pago crítico) y la cola de clasificación de costo por obra — todas
              reversibles, sin impacto económico externo ni decisión de negocio.
            </p>
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
