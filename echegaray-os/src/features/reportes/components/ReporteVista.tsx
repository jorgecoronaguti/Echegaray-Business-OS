import type { ReporteGenerado, ReporteDefinicion } from '../types'

// Vista de un reporte generado: mismo orden que define la skill (resumen →
// números → riesgos → decisiones → confianza → fuentes). Imprimible: con
// Cmd/Ctrl+P sale un PDF limpio (print:shadow-none y colores planos).

function Seccion({ titulo, items, testid }: { titulo: string; items: string[]; testid?: string }) {
  if (!items.length) return null
  return (
    <div className="mt-3" data-testid={testid}>
      <h4 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{titulo}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-800">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Qué es cada línea del bloque de confianza, en el orden en que se lee: primero lo que está
 * probado, al final lo que falta. `tono` sólo se despega del gris cuando la línea pide una acción
 * —una fuente que se congeló o un dato que no existe—, nunca para decorar.
 */
const CATEGORIAS_DE_CONFIANZA = [
  { clave: 'confirmados', rotulo: 'Confirmado', tono: 'text-emerald-700' },
  { clave: 'calculados', rotulo: 'Calculado', tono: 'text-gray-500' },
  { clave: 'estimados', rotulo: 'Estimado', tono: 'text-gray-500' },
  { clave: 'parciales', rotulo: 'Parcial', tono: 'text-gray-500' },
  { clave: 'fuentes_atrasadas', rotulo: 'Fuente atrasada', tono: 'text-amber-700' },
  { clave: 'gaps', rotulo: 'Gap', tono: 'text-amber-700' },
] as const

export function ReporteVista({ reporte, definicion }: { reporte: ReporteGenerado; definicion: ReporteDefinicion }) {
  const c = reporte.contenido
  const conf = reporte.confianza
  const fecha = new Date(reporte.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan' })

  return (
    <article className="rounded-lg border bg-white p-5 shadow-sm print:border-0 print:shadow-none" data-testid={`reporte-${definicion.clave}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900">{definicion.nombre}</h3>
        <span className="text-xs text-gray-500">
          {reporte.periodo_desde === reporte.periodo_hasta
            ? reporte.periodo_desde
            : `${reporte.periodo_desde} → ${reporte.periodo_hasta}`}{' '}
          · generado {fecha} · {reporte.generado_por}
        </span>
      </header>

      <p className="mt-3 text-sm font-medium text-gray-900">{c.resumen_ejecutivo}</p>

      {c.numeros_clave.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {c.numeros_clave.map((n) => (
            <div key={n.label} className="rounded border bg-gray-50 p-2">
              <div className="text-[10px] text-gray-500 uppercase">{n.label}</div>
              <div className="text-sm font-bold text-gray-900 tabular-nums">
                {n.link ? (
                  <a href={n.link} className="hover:underline">
                    {n.valor}
                  </a>
                ) : (
                  n.valor
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Seccion titulo="Principales cambios" items={c.principales_cambios} />
      <Seccion titulo="Riesgos" items={c.riesgos} testid="reporte-riesgos" />
      <Seccion titulo="Decisiones requeridas" items={c.decisiones_requeridas} testid="reporte-decisiones" />
      <Seccion titulo="Acciones vencidas" items={c.acciones_vencidas} />
      <Seccion titulo="Recomendaciones" items={c.recomendaciones} />

      <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600" data-testid="reporte-confianza">
        <span className="font-semibold uppercase">Confianza y fuentes</span>
        {/* Las seis categorías son las de las reglas de oro —HECHO · CÁLCULO · ESTIMACIÓN— y por eso
            se NOMBRAN. Antes cada una era un emoji distinto (✅ 🧮 ≈ ◔ ⏰ ⚠️): quien lee un reporte
            no decodifica ese vocabulario, y el Design System no admite emojis. El rótulo dice la
            categoría, que es justamente lo que la regla de oro exige que no se confunda. */}
        <ul className="mt-1 space-y-0.5">
          {CATEGORIAS_DE_CONFIANZA.map(({ clave, rotulo, tono }) =>
            conf[clave].map((x, i) => (
              <li key={`${clave}${i}`} className="flex gap-1.5">
                <span className={`shrink-0 font-semibold uppercase tracking-wide ${tono}`}>{rotulo}</span>
                <span>{x}</span>
              </li>
            )),
          )}
        </ul>
        <p className="mt-1 text-[11px] text-gray-400">Fuentes: {reporte.fuentes_usadas.join(', ')}</p>
      </div>

      {c.links_os.length > 0 && (
        <p className="mt-3 text-xs text-gray-500 print:hidden">
          {c.links_os.map((l, i) => (
            <span key={l.href}>
              {i > 0 && ' · '}
              <a href={l.href} className="underline hover:text-gray-700">
                {l.label}
              </a>
            </span>
          ))}
        </p>
      )}
    </article>
  )
}
