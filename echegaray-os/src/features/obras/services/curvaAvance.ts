// AVANCE REAL CONTRA ESPERADO — la lectura, sin pantalla.
//
// El Design canónico 02 pide en el Resumen una curva «real vs esperado» de las últimas seis semanas.
// LA SERIE HISTÓRICA NO EXISTE EN EL OS y no se fabrica: `obra_avance` publica el avance de HOY, un
// número por obra, y los partes de ejecución son incrementos por ACTIVIDAD —reconstruir con ellos un
// avance de obra semana a semana sería una SEGUNDA definición del mismo concepto, calculada distinto
// de la que muestra la métrica de arriba. El día que las dos se separaran, la misma pantalla diría
// dos avances de la misma obra.
//
// Lo que sí existe, medido y sin inventar nada, son DOS PUNTOS honestos:
//
//   · el avance REAL de hoy            → `obra_panel.avance_pct`, el mismo de la métrica del titular
//   · el avance ESPERADO por calendario → `desvioDePlazo`, la MISMA regla que pinta el Gantt de la
//     cartera. No hay umbral nuevo ni aritmética nueva acá: esto sólo la lee y la ubica en el eje.
//
// El esperado SÍ es una recta y dibujarla no fabrica nada: la regla lo define así —el trabajo
// repartido parejo sobre el calendario—. Es una ESTIMACIÓN, y la pantalla lo dice con esa palabra.
// Lo que NO se dibuja es una línea que una el arranque con el avance de hoy: eso afirmaría un camino
// que nadie midió.
//
// El día entra por parámetro: la lectura se prueba en cualquier fecha, sin navegador y sin base.

import { desvioDePlazo, PALABRA_SEMAFORO, type Semaforo } from './ganttObras.ts'

export interface LecturaCurva {
  /** Dónde debería ir por calendario, 0–100. ESTIMACIÓN. */
  esperadoPct: number
  /** Dónde va de verdad, 0–100. Es el avance publicado, no una reconstrucción. */
  realPct: number
  /** Puntos que faltan contra lo esperado. Nunca negativo: ir adelantado no es un desvío. */
  brechaPuntos: number
  /** Esos puntos en días de trabajo del plan. ESTIMACIÓN. */
  atrasoDias: number
  semaforo: Semaforo
  /** Cómo se llama el estado. Misma palabra que usa el Gantt de la cartera. */
  palabra: string
  /** El texto del desvío para el encabezado: «−10 pts vs esperado» o la palabra del estado. */
  titular: string
  inicio: string
  fin: string
}

export interface CurvaAvance {
  lectura: LecturaCurva | null
  /** Por qué no hay curva, en palabras. Sólo cuando `lectura` es `null`. */
  motivo: string | null
}

/**
 * LA LECTURA DE LA CURVA. Sin fechas de plan o sin avance medido NO hay curva y se dice por qué:
 * un gráfico con dos ceros afirmaría que la obra no avanzó, cuando lo que pasa es que nadie lo midió
 * —o que no hay plan contra el cual medirlo—. Son dos huecos distintos y se nombran distinto.
 */
export function lecturaCurva(
  inicio: string | null,
  fin: string | null,
  avancePct: number | null,
  hoyIso: string,
): CurvaAvance {
  if (!inicio || !fin) return { lectura: null, motivo: 'sin fechas de plan contra las que comparar' }
  if (avancePct == null) return { lectura: null, motivo: 'sin avance medido para comparar' }

  const d = desvioDePlazo(inicio, fin, avancePct, hoyIso)
  // `desvioDePlazo` sólo devuelve `sin_datos` cuando falta una fecha o el avance, y los dos casos ya
  // salieron por arriba. La guarda existe igual porque el que devuelve los números es él, no esto.
  if (d.avanceEsperadoPct == null || d.brechaPuntos == null || d.atrasoDias == null) {
    return { lectura: null, motivo: 'sin fechas de plan contra las que comparar' }
  }

  const realPct = Math.min(100, Math.max(0, Math.round(avancePct)))
  const titular = d.brechaPuntos > 0
    ? `−${d.brechaPuntos} pts vs esperado`
    : PALABRA_SEMAFORO[d.semaforo]

  return {
    lectura: {
      esperadoPct: d.avanceEsperadoPct,
      realPct,
      brechaPuntos: d.brechaPuntos,
      atrasoDias: d.atrasoDias,
      semaforo: d.semaforo,
      palabra: PALABRA_SEMAFORO[d.semaforo],
      titular,
      inicio,
      fin,
    },
    motivo: null,
  }
}

/** El punto de una serie sobre el lienzo, en unidades del `viewBox`. */
export interface PuntoCurva { x: number; y: number }

/**
 * DÓNDE CAE HOY EN EL EJE. El eje horizontal es el calendario del plan (inicio → fin) y el vertical
 * el avance 0–100, así que la recta del esperado va de esquina a esquina y el punto esperado cae
 * SIEMPRE sobre ella: `x` es la fracción de calendario consumida, que es exactamente lo que la regla
 * llama avance esperado. Una segunda cuenta para ubicar el eje podría separarse de la que decide el
 * color — acá hay una sola.
 */
export function puntosDeHoy(l: LecturaCurva, ancho: number, alto: number): {
  esperado: PuntoCurva; real: PuntoCurva
} {
  const x = (ancho * l.esperadoPct) / 100
  const y = (pct: number) => alto - (alto * pct) / 100
  return { esperado: { x, y: y(l.esperadoPct) }, real: { x, y: y(l.realPct) } }
}
