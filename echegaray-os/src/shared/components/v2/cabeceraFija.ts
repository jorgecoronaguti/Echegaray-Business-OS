// DÓNDE VA LA CABECERA CUANDO `sticky` NO LA SOSTIENE — 16/09/2026.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// El dueño, en Chrome sobre Mac: la fila «Persona + días» de Liquidación NO le queda fija al bajar, aunque
// `CintaHorizontal` la declara `position: sticky; top: 45px` y en el Chromium de QA sí se pega. `sticky`
// depende de TODA la cadena de ancestros —basta un `overflow` que cree scrollport, un `contain` o una
// extensión que envuelva el DOM— y eso no se puede afirmar desde el código. Lo que sí se puede es MEDIR:
// si el envoltorio de la cinta ya pasó bajo el header y la cabecera se fue con él, el sticky falló, y la
// cabecera pasa a `position: fixed` calculada desde el envoltorio.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA ═══
//
// La decisión —«¿falló?», «¿dónde la pongo?»— es geometría sobre cuatro rectángulos. Dentro del componente
// sólo se prueba con un navegador; acá se prueba con `node --test` en milisegundos, incluidos los dos bordes
// que en el navegador cuestan reproducir: el final del envoltorio (donde el sticky legítimamente se corre
// hacia arriba) y el arranque (donde todavía no hay nada que pegar).

/** Un rectángulo respecto de la ventana, como lo devuelve `getBoundingClientRect`. */
export interface Rect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface MedidaDeCabecera {
  /** El envoltorio entero de la cinta: cabecera (o su espaciador) + tabla. */
  envoltorio: Rect
  /** La cabecera tal como quedó dibujada. */
  cabecera: { top: number; height: number }
  /** El borde bajo el que tiene que quedar: el alto del header de la app. */
  techo: number
}

export type ModoDeCabecera =
  | { modo: 'flujo' }
  | { modo: 'fija'; top: number; left: number; width: number }

const TOLERANCIA = 1

/** ¿Todavía queda tabla debajo de donde iría la cabecera? Al final del envoltorio, no hay nada que sostener. */
function quedaTablaDebajo(m: MedidaDeCabecera): boolean {
  return m.envoltorio.bottom > m.techo + m.cabecera.height + TOLERANCIA
}

/**
 * ¿EL STICKY NO LA SOSTUVO? Sólo se juzga cuando DEBERÍA estar pegada: el envoltorio ya pasó bajo el header y
 * queda tabla debajo. Al final del envoltorio el sticky se corre hacia arriba por especificación y no es falla.
 */
export function elStickyFallo(m: MedidaDeCabecera): boolean {
  const deberiaEstarPegada = m.envoltorio.top < m.techo - TOLERANCIA && quedaTablaDebajo(m)
  return deberiaEstarPegada && m.cabecera.top < m.techo - TOLERANCIA
}

/**
 * CON EL STICKY CAÍDO, DÓNDE VA. Fija mientras el envoltorio esté bajo el header y quede tabla; en flujo antes
 * de eso y después (sin esto, al pasar de largo la tabla la cabecera seguiría flotando sobre lo que sigue).
 */
export function modoDeCabecera(m: MedidaDeCabecera, stickyRoto: boolean): ModoDeCabecera {
  if (!stickyRoto) return { modo: 'flujo' }
  if (m.envoltorio.top >= m.techo || !quedaTablaDebajo(m)) return { modo: 'flujo' }
  return { modo: 'fija', top: m.techo, left: m.envoltorio.left, width: m.envoltorio.width }
}

/** Dos modos iguales no disparan un render: el medidor corre en cada scroll. */
export function mismoModo(a: ModoDeCabecera, b: ModoDeCabecera): boolean {
  if (a.modo !== b.modo) return false
  if (a.modo === 'flujo' || b.modo === 'flujo') return true
  return a.top === b.top && a.left === b.left && a.width === b.width
}
