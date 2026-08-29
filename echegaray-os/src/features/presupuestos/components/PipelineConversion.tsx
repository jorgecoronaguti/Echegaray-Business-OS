// 13 · EL PIPELINE DE CINCO PASOS — dónde estás en la cadena que va del análisis a la obra.
//
// No es decoración. La conversión es el único punto del sistema donde una estructura ECONÓMICA
// (rubro → partida → análisis) se vuelve una estructura OPERATIVA (obra → frente → actividad), y
// esa es la idea más difícil de todo el módulo.
//
// ═══ HASTA EL 29/08/2026 SÍ ERA DECORACIÓN ═══
//
// Tenía `const ACTUAL = 3` y la barra clavada en 60 %. El tilde verde del paso 1 aparecía aunque
// ninguna partida tuviera análisis; el paso 4 salía gris aunque el presupuesto ya estuviera
// convertido entero. Era un dibujo que afirmaba cinco cosas sin mirar ni una.
//
// Ahora el estado de cada paso sale de `services/pipeline.ts`, que es puro, tiene tests, y devuelve
// junto con el estado el DATO del que sale (`porQue`) — que es lo que hace revisable un dibujo. El
// paso 5 puede quedar en SIN DATO: esta pantalla no lee el avance de la obra, y pintarlo «pendiente»
// afirmaría que la obra no arrancó.

import { avanceDelPipeline, type Paso } from '../services/pipeline.ts'

export function PipelineConversion({ pasos }: { pasos: Paso[] }) {
  const avance = avanceDelPipeline(pasos)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line py-3.5">
      {/* LA TAXONOMÍA DEL CANON 13: lo hecho lleva tilde, el paso actual va en pastilla con su
          número y su nombre, lo que falta queda en gris. El canon dibuja cuatro pasos de un asistente
          que CREA la obra; acá los pasos son otros —la cadena real que va del análisis a la ejecución,
          y la obra ya existe cuando se llega— así que se adopta la forma, no el contenido. */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" data-testid="pipeline">
        {pasos.map((p, i) => {
          const activo = p.estado === 'actual'
          const hecho = p.estado === 'hecho'
          const sinDato = p.estado === 'sin-dato'
          return (
            <li key={p.n} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-[13px] text-faint">→</span>}
              <span
                className={`flex items-center gap-2 rounded-control ${activo ? 'bg-surface-quiet py-1 pl-1 pr-3' : ''}`}
                data-paso={p.n}
                data-estado={p.estado}
                // El dato del que sale el estado, al alcance del mouse: un pipeline que no se puede
                // auditar vuelve a ser un adorno, aunque los números sean reales.
                title={p.porQue}
              >
                <span
                  aria-hidden
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    activo ? 'bg-marca text-[color:var(--os-on-marca)]'
                      : hecho ? 'bg-pos-soft text-pos'
                      : sinDato ? 'border border-dashed border-line bg-transparent text-faint'
                      : 'bg-surface-sunken text-faint'
                  }`}
                >
                  {hecho ? '✓' : sinDato ? '?' : p.n}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[12.5px] leading-tight ${
                    activo ? 'font-semibold text-ink' : hecho ? 'text-muted' : 'text-faint'
                  }`}>
                    {p.titulo}
                  </span>
                  {/* El subtítulo sólo del paso ACTIVO (Design 23/08). Y el del que quedó SIN DATO,
                      porque «?» sin explicación es peor que no dibujarlo. */}
                  {(activo || sinDato) && (
                    <span className="block text-[10.5px] leading-tight text-faint">
                      {sinDato ? p.porQue : p.sub}
                    </span>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      {/* LA BARRA CUENTA PASOS HECHOS, y su denominador son los MEDIBLES. Meter en el denominador
          un paso que nadie pudo mirar publicaría un avance más bajo que el real por una limitación
          de la pantalla, no de la obra. */}
      {avance && (
        <div className="flex items-center gap-3" data-testid="pipeline-avance" data-hechos={avance.hechos} data-medibles={avance.medibles}>
          <span className="text-[12px] text-muted">
            {avance.hechos} de {avance.medibles} {avance.medibles < pasos.length && <span className="text-faint">medibles</span>}
          </span>
          <span aria-hidden className="h-[5px] w-[120px] overflow-hidden rounded-full bg-surface-sunken">
            <span className="block h-full rounded-full bg-marca" style={{ width: `${avance.fraccion * 100}%` }} />
          </span>
        </div>
      )}
    </div>
  )
}
