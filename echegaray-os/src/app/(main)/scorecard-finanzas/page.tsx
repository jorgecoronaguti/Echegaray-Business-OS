import { createClient } from '@/lib/supabase/server'
import {
  getScorecardVigente,
  getScorecardHistoria,
} from '@/features/scorecard-finanzas/services/scorecardFinanzasService'
import { armarVista, datosAlDe, type MetricaVista, type UnidadScorecard, type FilaScorecard } from '@/features/scorecard-finanzas/types'

// SCORECARD DE ADMIN/FINANZAS + KPIs DEL PROPIO OS (F6).
//
// Patrón del OS: la Web SÓLO LEE la tabla materializada public.finanzas_scorecard (0 recálculo acá).
// El cálculo vive en orquestador/scripts/sync-scorecard-finanzas.mjs, que lee las fuentes únicas
// (finanzas_modelo_liquidez, fuentes_datos, finanzas_caja_negra) y congela un snapshot por corrida.
//
// Esta página es la PLANTILLA REPLICABLE para las otras 6 áreas: cambia el `area` que lee el service y
// el resto (secciones, cards, tendencia, manejo de sin_datos) se reusa igual.

async function loadScorecard() {
  try {
    const supabase = await createClient()
    const [vigente, historia] = await Promise.all([
      getScorecardVigente(supabase),
      getScorecardHistoria(supabase),
    ])
    return { vigente, historia }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { vigente: { data: null, error } as const, historia: { data: null, error } as const }
  }
}

// ── Formateo (presentación pura; el número ya viene calculado desde la tabla) ──

function fmtValor(valor: number | null, unidad: UnidadScorecard): string {
  if (valor === null) return 'aún sin datos'
  switch (unidad) {
    case 'pesos':
      return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
    case 'porcentaje':
      return `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    case 'dias':
      return `${valor.toLocaleString('es-AR')} días`
    case 'cantidad':
      return valor.toLocaleString('es-AR')
    default:
      return String(valor)
  }
}

function fmtVariacion(variacion: number | null, unidad: UnidadScorecard): string {
  if (variacion === null || variacion === 0) return ''
  const signo = variacion > 0 ? '+' : '−'
  const abs = Math.abs(variacion)
  const cuerpo =
    unidad === 'pesos'
      ? abs.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
      : unidad === 'porcentaje'
        ? `${abs.toLocaleString('es-AR', { maximumFractionDigits: 1 })} pp`
        : abs.toLocaleString('es-AR')
  return `${signo}${cuerpo}`
}

// Mini-tendencia como barras SVG. Sólo pinta valores YA guardados; no calcula nada de negocio.
function Sparkline({ serie }: { serie: number[] }) {
  if (serie.length < 2) {
    return <span className="text-xs text-gray-400">sin historia todavía</span>
  }
  const max = Math.max(...serie.map((v) => Math.abs(v)), 1)
  const w = 88
  const h = 24
  const paso = w / serie.length
  return (
    <svg width={w} height={h} className="text-gray-400" aria-hidden data-testid="kpi-sparkline">
      {serie.map((v, i) => {
        const alto = Math.max(2, (Math.abs(v) / max) * h)
        return <rect key={i} x={i * paso + 1} y={h - alto} width={Math.max(2, paso - 2)} height={alto} rx={1} fill="currentColor" />
      })}
    </svg>
  )
}

function KpiCard({ m }: { m: MetricaVista }) {
  const sinDatos = m.estado === 'sin_datos' || m.valor === null
  return (
    <div
      className="flex flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      data-testid={`kpi-${m.metrica}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-600">{m.etiqueta}</p>
        {!sinDatos && <Sparkline serie={m.serie} />}
      </div>

      {sinDatos ? (
        <div className="mt-2" data-testid="kpi-sin-datos">
          <p className="text-lg font-semibold text-gray-400">aún sin datos</p>
          {m.deDondeSaldria && (
            <p className="mt-1 text-xs text-gray-500">
              <span className="font-medium">De dónde saldría:</span> {m.deDondeSaldria}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-2xl font-bold tabular-nums text-gray-900" data-testid="kpi-valor">
            {fmtValor(m.valor, m.unidad)}
          </p>
          {m.variacion !== null && m.variacion !== 0 && (
            <p
              className={`mt-1 text-xs font-medium ${m.variacion > 0 ? 'text-emerald-700' : 'text-red-700'}`}
              data-testid="kpi-variacion"
            >
              {m.variacion > 0 ? '▲' : '▼'} {fmtVariacion(m.variacion, m.unidad)} vs. lectura anterior
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] uppercase tracking-wide text-gray-400">fuente: {m.fuente_unica}</p>
    </div>
  )
}

function Seccion({ titulo, descripcion, metricas, testid }: { titulo: string; descripcion: string; metricas: MetricaVista[]; testid: string }) {
  return (
    <section className="space-y-4" data-testid={testid}>
      <div>
        <h2 className="text-xl font-semibold">{titulo}</h2>
        <p className="mt-1 text-sm text-gray-600">{descripcion}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricas.map((m) => (
          <KpiCard key={m.metrica} m={m} />
        ))}
      </div>
    </section>
  )
}

export default async function ScorecardFinanzasPage() {
  const { vigente, historia } = await loadScorecard()

  const pageError = vigente.error ?? historia.error
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false

  const vigentes: FilaScorecard[] = vigente.data ?? []
  const hist: FilaScorecard[] = historia.data ?? []
  const salud = armarVista(vigentes, hist, 'salud_area')
  const metricasOs = armarVista(vigentes, hist, 'metricas_os')
  const datosAl = datosAlDe(vigentes)
  const capturadoEn = vigentes[0]?.capturado_en ?? null
  const hayDatos = vigentes.length > 0

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Scorecard · Admin y Finanzas</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Salud del área (posición, colchón, obligaciones — cada número apunta a su fuente única) junto con cuánto
          aprende el propio OS: precisión de su forecast y frescura de sus fuentes. La página sólo lee la tabla
          materializada; el cálculo vive en el sync. Lo que aún no tiene dato se muestra como &quot;aún sin datos&quot;,
          nunca inventado.
        </p>
        {hayDatos && (
          <p className="mt-2 text-xs text-gray-500">
            {capturadoEn && <>Última lectura: {new Date(capturadoEn).toLocaleString('es-AR')}. </>}
            {datosAl && <>Datos del modelo al {new Date(datosAl).toLocaleString('es-AR')}.</>}
          </p>
        )}
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

      {!pageError && !hayDatos && (
        <div className="rounded border border-gray-300 bg-gray-50 p-4 text-gray-700" data-testid="scorecard-vacio">
          <p className="font-semibold">Todavía no hay snapshots del scorecard.</p>
          <p className="mt-1 text-sm">
            Corré <code className="rounded bg-gray-200 px-1">node orquestador/scripts/sync-scorecard-finanzas.mjs</code>{' '}
            para congelar el primer snapshot desde las fuentes únicas.
          </p>
        </div>
      )}

      {hayDatos && (
        <div className="space-y-10" data-testid="scorecard-finanzas-section">
          <Seccion
            titulo="Salud del área"
            descripcion="Posición de caja, colchón, cobranzas y obligaciones. Fuente única: Modelo de Liquidez (finanzas_modelo_liquidez)."
            metricas={salud}
            testid="salud-area-section"
          />
          <Seccion
            titulo="Cuánto aprende el OS"
            descripcion="Precisión de su propio forecast (caja negra), frescura de sus fuentes y capacidades aún sin medición conectada."
            metricas={metricasOs}
            testid="metricas-os-section"
          />
        </div>
      )}
    </div>
  )
}
