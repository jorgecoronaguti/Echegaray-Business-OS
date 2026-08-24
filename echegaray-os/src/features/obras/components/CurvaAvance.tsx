// AVANCE REAL CONTRA ESPERADO — el bloque del Resumen que faltaba (Design canónico 02).
//
// ═══ DOS PUNTOS MEDIDOS, NO UNA CURVA INVENTADA ═══
//
// El mockup dibuja seis semanas de serie. El OS no publica esa serie: `obra_avance` da el avance de
// HOY y los partes son incrementos por actividad. Reconstruir la serie acá sería una segunda
// definición del avance de la obra, distinta de la que muestra la métrica de arriba en la misma
// pantalla. Así que se dibuja lo que sí está medido: dónde debería ir por calendario y dónde va, los
// dos a hoy, y la brecha entre los dos como un segmento vertical — que es exactamente el número que
// la pantalla existe para dar.
//
// La recta del esperado NO es una suposición del gráfico: es la definición de la regla (el trabajo
// repartido parejo sobre el calendario), la misma que pinta el semáforo del Gantt de la cartera. Y
// es una ESTIMACIÓN, dicho con esa palabra donde se lee el número.
//
// LO QUE NO SE DIBUJA: una línea del arranque hasta el avance de hoy. Afirmaría un camino que nadie
// midió, y sobre una obra que estuvo parada tres semanas se leería como avance parejo.
//
// El lienzo NO lleva texto adentro: el SVG escala con el ancho del bloque y las letras escalarían
// con él. Los números van afuera, en la tipografía del sistema.

import { Ayuda } from '@/shared/components/ds'
import { Tarjeta, CabeceraTarjeta } from './TarjetaResumen'
import { lecturaCurva, puntosDeHoy, type LecturaCurva } from '../services/curvaAvance'
import type { Semaforo } from '../services/ganttObras'
import { fecha } from './formato'

/** Unidades del lienzo. El SVG se estira al ancho del bloque conservando esta proporción. */
const ANCHO = 320
const ALTO = 96

/** El color del punto real y de la brecha. Mismo criterio que el Gantt: grafito lo normal, el color
 *  sólo cuando hay algo que atender. Verde únicamente para el 100%, que es un hecho, no un ánimo. */
const COLOR: Record<Semaforo, { trazo: string; relleno: string; texto: string }> = {
  al_dia: { trazo: 'stroke-accent', relleno: 'fill-accent', texto: 'text-muted' },
  atraso_menor: { trazo: 'stroke-warn', relleno: 'fill-warn', texto: 'text-warn' },
  atraso_critico: { trazo: 'stroke-neg', relleno: 'fill-neg', texto: 'text-neg' },
  sin_datos: { trazo: 'stroke-line-strong', relleno: 'fill-faint', texto: 'text-faint' },
}

export function CurvaAvance({
  inicio, fin, avancePct, hoy,
}: {
  /** Inicio del plan de la obra. `null` = no hay contra qué comparar, y se dice. */
  inicio: string | null
  fin: string | null
  /** El avance publicado, el mismo de la métrica del titular. `null` = sin medir, nunca 0. */
  avancePct: number | null
  hoy: string
}) {
  const { lectura, motivo } = lecturaCurva(inicio, fin, avancePct, hoy)

  return (
    // Enmarcada como el resto del canónico 02: sin marco, la curva y «Próximas 2 semanas» quedaban
    // flotando una al lado de la otra sobre el mismo blanco y se leían como un solo bloque.
    <Tarjeta testid="curva-avance" className="min-w-0 flex-1">
      <CabeceraTarjeta
        icono={
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
          </svg>
        }
        titulo="Avance real vs esperado"
        accion={lectura && (
          <span className={`text-[11.5px] ${COLOR[lectura.semaforo].texto}`} data-testid="curva-desvio">
            {lectura.titular}
          </span>
        )}
      />

      {lectura == null ? (
        // EL HUECO CON SU MOTIVO, sin gráfico. Un lienzo vacío se lee como una obra sin avance.
        <p className="px-4 py-4 text-[12.5px] text-faint" data-nulo="" data-testid="curva-sin-datos">
          {motivo}
        </p>
      ) : (
        <div className="px-4 pb-3 pt-3.5">
          <Lienzo l={lectura} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                lectura.semaforo === 'atraso_critico' ? 'bg-neg' : lectura.semaforo === 'atraso_menor' ? 'bg-warn' : 'bg-accent'
              }`} />
              real <span className="font-mono tabular-nums text-ink">{lectura.realPct}%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-[3px] w-4 shrink-0 rounded-sm bg-line-strong" />
              esperado <span className="font-mono tabular-nums">{lectura.esperadoPct}%</span>
              {/* LA PALABRA VA DONDE ESTÁ EL NÚMERO: escondida en la ayuda, el esperado se lee como
                  un hecho de la obra y no lo es. */}
              <span className="text-faint">· ESTIMACIÓN</span>
            </span>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
              {fecha(lectura.inicio)} → {fecha(lectura.fin)}
            </span>
          </div>
          {lectura.brechaPuntos > 0 && (
            <p className={`mt-2 text-[12px] ${COLOR[lectura.semaforo].texto}`} data-testid="curva-brecha">
              {lectura.brechaPuntos} puntos por debajo del calendario, unos {lectura.atrasoDias}{' '}
              día{lectura.atrasoDias === 1 ? '' : 's'} de trabajo.
            </p>
          )}
          <Ayuda titulo="Por qué son dos puntos y no una curva" testid="ayuda-curva">
            El OS mide el avance de la obra HOY; no publica una serie semanal. Dibujar la curva del
            pasado obligaría a reconstruirla con los partes de cada actividad —otra cuenta, otro
            resultado— y esta pantalla mostraría dos avances distintos de la misma obra. El esperado
            supone el trabajo repartido parejo sobre el calendario del plan, y ninguna obra avanza
            así: ordena la atención, no afirma cuánto se atrasó.
          </Ayuda>
        </div>
      )}
    </Tarjeta>
  )
}

/** El lienzo: la recta del esperado, el día de hoy, y la brecha entre los dos puntos. */
function Lienzo({ l }: { l: LecturaCurva }) {
  const { esperado, real } = puntosDeHoy(l, ANCHO, ALTO)
  const c = COLOR[l.semaforo]
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Avance real ${l.realPct}% contra ${l.esperadoPct}% esperado por calendario (estimación)`}
    >
      {/* El piso del gráfico: 0% de avance. Sin él la recta flota. */}
      <line x1={0} y1={ALTO} x2={ANCHO} y2={ALTO} className="stroke-line" strokeWidth={1} />
      {/* LA RECTA DEL ESPERADO va de (inicio, 0%) a (fin, 100%): es la regla dibujada, no una
          tendencia ajustada a los datos. Punteada porque no es una medición. */}
      <line x1={0} y1={ALTO} x2={ANCHO} y2={0} className="stroke-line-strong" strokeWidth={1.6} strokeDasharray="4 3" />
      {/* HOY, en el amarillo de la marca: es el mismo eje vertical que el Gantt de la cartera. */}
      <line x1={esperado.x} y1={0} x2={esperado.x} y2={ALTO} className="stroke-marca" strokeWidth={2} />
      {/* LA BRECHA, que es el dato: el segmento entre lo que debería y lo que hay. */}
      <line
        x1={esperado.x} y1={esperado.y} x2={real.x} y2={real.y}
        className={c.trazo} strokeWidth={2} data-testid="curva-segmento"
      />
      <circle cx={esperado.x} cy={esperado.y} r={3} className="fill-line-strong" />
      <circle cx={real.x} cy={real.y} r={3.5} className={c.relleno} data-testid="curva-punto-real" />
    </svg>
  )
}
