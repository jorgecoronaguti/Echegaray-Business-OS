// LAS SEÑALES DE `/campo` — la única regla de esta pantalla, y por eso es pura y está probada.
//
// La entrada de obra en el teléfono no muestra números: muestra SI HAY ALGO QUE HACER. Eso convierte
// un conteo en una de tres cosas:
//
//   · nada que decir        → la fila va sin señal (no «0 en camino», no «0 abiertos»)
//   · algo pendiente        → la señal en `warn`: el parte sin cargar, el impedimento abierto
//   · algo informativo      → la señal en `faint`: lo que hay, sin urgencia
//
// ═══ LOS DOS DEFECTOS QUE ESTO EVITA ═══
//
// 1. UN CERO INVENTADO. «0 pedidos en camino» y «no pude leer los pedidos» se ven igual en la
//    pantalla y son cosas opuestas. Cuando el conteo es `null` —la consulta falló— la fila NO lleva
//    señal, y el error se muestra arriba con el mensaje de la fuente.
// 2. UN PENDIENTE PINTADO COMO LOGRO. El parte sin cargar es lo que hay que hacer hoy: va en `warn`
//    aunque sea el estado normal a las 8 de la mañana.

export interface Senal {
  texto: string
  /** `true` = `warn`: algo pendiente. `false` = `faint`: informativo. */
  pendiente: boolean
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** El parte del día. Cero partes hoy NO es un dato neutro: es lo que falta hacer. */
export function senalParte(partesHoy: number | null): Senal | null {
  if (partesHoy === null) return null
  if (partesHoy === 0) return { texto: 'sin cargar hoy', pendiente: true }
  return { texto: `${partesHoy} ${plural(partesHoy, 'cargado', 'cargados')} hoy`, pendiente: false }
}

/** Los pedidos que todavía no llegaron. Sin ninguno, la fila no dice nada. */
export function senalPedidos(sinEntregar: number | null): Senal | null {
  if (sinEntregar === null || sinEntregar === 0) return null
  return { texto: `${sinEntregar} sin entregar`, pendiente: false }
}

/** Cuántas herramientas hay en las obras de esta persona. */
export function senalHerramientas(enObra: number | null): Senal | null {
  if (enObra === null || enObra === 0) return null
  return { texto: `${enObra} en obra`, pendiente: false }
}

/** Impedimentos abiertos: lo único de esta pantalla que frena el trabajo de todos. */
export function senalImpedimentos(abiertos: number | null): Senal | null {
  if (abiertos === null || abiertos === 0) return null
  return { texto: `${abiertos} ${plural(abiertos, 'abierto', 'abiertos')}`, pendiente: true }
}

/** Los movimientos de los últimos días: contexto, nunca una tarea. */
export function senalMovimientos(recientes: number | null): Senal | null {
  if (recientes === null || recientes === 0) return null
  return { texto: `${recientes} esta semana`, pendiente: false }
}
