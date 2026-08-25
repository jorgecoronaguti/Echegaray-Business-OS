import { createClient } from '@/lib/supabase/server'
import type { ReporteDefinicion, ReporteGenerado } from '@/features/reportes/types'
import { FRECUENCIA_LABEL } from '@/features/reportes/types'
import { GenerarReporteButton } from '@/features/reportes/components/GenerarReporteButton'
import { ReporteVista } from '@/features/reportes/components/ReporteVista'
import { IconoDocumento } from '@/shared/components/iconos'

// Sección Reportes (skill reportes-automaticos-y-comunicaciones, 2026-07-10):
// cada definición con su última generación visible y su historial. Generación
// on-demand; el scheduling programado usa la misma definición (frecuencia +
// dia_hora) cuando se active. Canal actual: publicación en el OS + imprimir a
// PDF. Email institucional/WhatsApp: preparados en el modelo, no activos.

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const supabase = await createClient()
  const [{ data: defs }, { data: generados }] = await Promise.all([
    supabase.from('reportes_definiciones').select('*').eq('activo', true).order('created_at'),
    supabase.from('reportes_generados').select('*').order('created_at', { ascending: false }).limit(60),
  ])

  const definiciones = (defs ?? []) as ReporteDefinicion[]
  const historial = (generados ?? []) as ReporteGenerado[]
  const ultimoPorDef = new Map<string, ReporteGenerado>()
  for (const g of historial) if (!ultimoPorDef.has(g.definicion_id)) ultimoPorDef.set(g.definicion_id, g)

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <IconoDocumento className="h-6 w-6 text-gray-500" />
        Reportes
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Cada reporte declara sus fuentes y su confianza. Para PDF: abrir el reporte y imprimir (Cmd/Ctrl+P).
      </p>

      <div className="mt-6 space-y-8">
        {definiciones.map((def) => {
          const ultimo = ultimoPorDef.get(def.id)
          const anteriores = historial.filter((g) => g.definicion_id === def.id).slice(ultimo ? 1 : 0, 6)
          return (
            <section key={def.id} data-testid={`definicion-${def.clave}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{def.nombre}</h2>
                  <p className="text-xs text-gray-500">
                    {def.objetivo} · {FRECUENCIA_LABEL[def.frecuencia]}
                    {def.dia_hora ? ` (${def.dia_hora})` : ''} · audiencia: {def.audiencia} · canal: {def.canal.toUpperCase()}
                  </p>
                </div>
                <GenerarReporteButton clave={def.clave} definicionId={def.id} />
              </div>

              {ultimo ? (
                <div className="mt-3">
                  <ReporteVista reporte={ultimo} definicion={def} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500" data-testid={`sin-generaciones-${def.clave}`}>
                  Todavía no se generó — usar «Generar ahora».
                </p>
              )}

              {anteriores.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                    Historial ({anteriores.length} anteriores)
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs text-gray-600">
                    {anteriores.map((g) => (
                      <li key={g.id}>
                        {new Date(g.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan' })} ·{' '}
                        {g.generado_por} · {g.estado_entrega} · {g.contenido.resumen_ejecutivo.slice(0, 110)}…
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )
        })}
        {definiciones.length === 0 && <p className="text-sm text-gray-500">No hay definiciones de reportes activas.</p>}
      </div>
    </div>
  )
}
