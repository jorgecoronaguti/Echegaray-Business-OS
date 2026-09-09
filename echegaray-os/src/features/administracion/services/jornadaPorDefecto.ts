// LA JORNADA POR DEFECTO ES DEL DÍA DE LA SEMANA, NO DE LA OBRA.
// Dueño, 08/09/2026: «por defecto siempre poner 9 hs de L a J y 8 hs los V cuando se da el presente».
// Sábado y domingo no tienen jornada por defecto: si alguien trabajó, se carga a mano.
/** `fecha` en ISO `AAAA-MM-DD`. Devuelve `null` para sábado y domingo. */
export function jornadaPorDefecto(fecha: string): number | null {
  const [a, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 dom … 6 sáb
  if (dow >= 1 && dow <= 4) return 9
  if (dow === 5) return 8
  return null
}

/**
 * LAS HORAS QUE UN CONJUNTO DE DÍAS ESPERA, día por día.
 *
 * Existe porque la app calculaba la referencia de una quincena como `días hábiles × una jornada
 * uniforme` —el «61,6 h = 8,8 × 7» que informaba la ficha—, y con la regla del dueño del 08/09/2026
 * la jornada ya no es un número por período: es 9 de lunes a jueves y 8 los viernes. Multiplicar un
 * promedio por la cantidad de días da un número que no coincide con ninguna quincena real, y encima
 * cambia si la quincena tiene uno o dos viernes.
 *
 * El sábado y el domingo suman 0: no tienen jornada por defecto, y trabajarlos se carga a mano.
 */
export function horasEsperadasDeDias(dias: readonly string[]): number {
  let total = 0
  for (const f of dias) total += jornadaPorDefecto(f) ?? 0
  return Math.round(total * 100) / 100
}
