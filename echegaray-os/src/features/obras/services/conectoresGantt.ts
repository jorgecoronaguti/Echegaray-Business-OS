// LAS DEPENDENCIAS, DIBUJADAS — la geometría en L del patrón «Gantt row» (COMPONENTS.md §Gantt row).
//
// ═══ POR QUÉ ESTO NO VIVE ADENTRO DEL COMPONENTE ═══
//
// Es aritmética que se equivoca en silencio: un conector mal calculado no da error, dibuja una
// flecha que sale de la actividad equivocada — y una flecha es una AFIRMACIÓN sobre qué espera a
// qué. Una barra corrida se nota; una flecha corrida se cree. Acá es puro y se prueba sin navegador.
//
// ═══ LO QUE NO SE DIBUJA ═══
//
// Una dependencia con una punta fuera de la vista (filtrada por la vista crítica, o plegada dentro
// de un frente cerrado) NO se dibuja a medias: media flecha apuntando al borde se lee como una
// dependencia hacia afuera de la obra. Se cuenta aparte para poder decirlo con un número.
//
// ═══ POR QUÉ % EN X Y PÍXELES EN Y ═══
//
// El lienzo es porcentual (`escalaCronograma`) y las filas tienen alto fijo. Un SVG obligaría a
// elegir una sola unidad: con `viewBox` en porcentaje el trazo vertical se estira y las flechas se
// deforman. Tres rectángulos posicionados con `left/width` en % y `top/height` en px no se deforman
// nunca, y son los mismos números que este archivo devuelve.

/** El tramo de una barra, tal como lo devuelve `tramoDe`. */
export interface TramoBarra { izqPct: number; anchoPct: number }

export interface FilaConector {
  actividadId: string | null
  tramo: TramoBarra | null
}

export interface DependenciaConector {
  origen_id: string
  destino_id: string
}

/** Un rectángulo del conector: X en % del lienzo, Y en píxeles desde el techo del área de filas. */
export interface Segmento { izqPct: number; anchoPct: number; topPx: number; altoPx: number }

export interface Conector {
  clave: string
  /** Los tres tramos de la L: sale del origen, baja o sube, entra al destino. */
  segmentos: Segmento[]
  /** Dónde apoyar la punta de flecha: el arranque de la barra del destino. */
  flecha: { izqPct: number; topPx: number }
  /** La flecha apunta hacia atrás cuando el destino arranca ANTES de que el origen termine. Es una
   *  dependencia que el plan no está respetando, y se dibuja distinto para que se vea. */
  invertido: boolean
}

/** Cuánto retrocede el codo desde el arranque del destino, en % del ancho del lienzo. Un codo de 0
 *  pegaría el trazo vertical contra la barra y la flecha nacería adentro de la barra. */
const CODO_PCT = 1.2
const GROSOR_PCT = 0.12

export interface OpcionesConectores {
  altoFila: number
  /** Techo máximo de conectores dibujados. Con 300 actividades encadenadas el lienzo se vuelve una
   *  malla que no informa nada y cuesta un reflow por fila. Se devuelve cuántos quedaron afuera. */
  maximo?: number
}

export interface ResultadoConectores {
  conectores: Conector[]
  /** Dependencias reales que no se pudieron dibujar: una punta fuera de la vista, sin fechas, o
   *  pasado el techo. La pantalla lo DICE — un Gantt con menos flechas de las que hay se lee como
   *  una obra con menos secuencia de la que tiene. */
  omitidas: number
}

/**
 * LOS CONECTORES DE LAS DEPENDENCIAS VISIBLES.
 *
 * `filas` viene en el orden en que se dibujan: el índice ES la fila, y por eso el mismo arreglo que
 * pinta las barras pinta las flechas. Si se pasara un orden distinto las flechas apuntarían a la
 * fila de al lado, que es exactamente el defecto que este archivo existe para poder probar.
 */
export function conectoresDe(
  filas: FilaConector[],
  dependencias: DependenciaConector[],
  { altoFila, maximo = 200 }: OpcionesConectores,
): ResultadoConectores {
  const indice = new Map<string, number>()
  filas.forEach((f, i) => { if (f.actividadId) indice.set(f.actividadId, i) })

  const conectores: Conector[] = []
  let omitidas = 0
  for (const d of dependencias) {
    const iO = indice.get(d.origen_id)
    const iD = indice.get(d.destino_id)
    const tO = iO == null ? null : filas[iO].tramo
    const tD = iD == null ? null : filas[iD].tramo
    if (iO == null || iD == null || !tO || !tD || iO === iD) { omitidas++; continue }
    if (conectores.length >= maximo) { omitidas++; continue }

    const yO = iO * altoFila + altoFila / 2
    const yD = iD * altoFila + altoFila / 2
    const xO = tO.izqPct + tO.anchoPct
    const xD = tD.izqPct
    const invertido = xD < xO
    const xCodo = xD - CODO_PCT > xO ? xD - CODO_PCT : xO + CODO_PCT / 3

    conectores.push({
      clave: `${d.origen_id}->${d.destino_id}`,
      segmentos: [
        horizontal(xO, xCodo, yO),
        vertical(xCodo, yO, yD),
        horizontal(xCodo, xD, yD),
      ].filter((s) => s.anchoPct > 0 || s.altoPx > 0),
      flecha: { izqPct: xD, topPx: yD },
      invertido,
    })
  }
  return { conectores, omitidas }
}

function horizontal(x1: number, x2: number, y: number): Segmento {
  return {
    izqPct: Math.min(x1, x2),
    anchoPct: Math.abs(x2 - x1),
    topPx: y,
    altoPx: 0,
  }
}

function vertical(x: number, y1: number, y2: number): Segmento {
  return {
    izqPct: x,
    anchoPct: GROSOR_PCT,
    topPx: Math.min(y1, y2),
    altoPx: Math.abs(y2 - y1),
  }
}
