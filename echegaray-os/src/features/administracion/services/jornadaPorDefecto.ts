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
