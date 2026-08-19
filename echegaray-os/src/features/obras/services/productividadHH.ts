// LAS DOS LECTURAS DE HH QUE LA PANTALLA HACE POR SU CUENTA — aritmética pura, fuera del JSX.
//
// Vive en un `.ts` y no en el componente por una razón mecánica: el runner de este repo (`node
// --test`) sabe leer TypeScript pero NO `.tsx`, así que una función pura exportada desde un
// componente no se puede probar. Y por una mejor: son las dos reglas que deciden si esta pantalla
// dice la verdad, y tienen que estar donde un test las alcance.

import type { ActividadHH, RegistroHH } from './personalService'
import type { Asignacion } from '../types'

const pct = (n: number | null) =>
  n == null ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

/**
 * LA LECTURA DE PRODUCTIVIDAD DEL MVP, en una frase.
 *
 * Con avance físico y consumo de horas, la comparación entre los dos dice si el trabajo se está
 * comiendo el plan antes de tiempo. Sin alguna de las puntas NO se compara: se dice cuál falta.
 * Sin índices, sin alertas predictivas, sin IA — el dueño lo pidió así, y es lo único que estos
 * datos sostienen hoy.
 *
 * EL UMBRAL DE ±10 PUNTOS no es una medición: es el ruido por debajo del cual una diferencia entre
 * avance y consumo no significa nada —el avance se carga a ojo, en múltiplos de 5 o 10—. Adjetivar
 * una diferencia de 4 puntos sería inventar una señal.
 */
export function lecturaProductividad(a: ActividadHH): string {
  if (a.hh_plan == null) return 'HH plan sin cargar'
  if (a.hh_real == null) return 'sin horas imputadas'
  if (a.avance_pct == null) return `HH consumidas ${pct(a.consumo_plan_pct)} del plan · avance sin medir`
  const texto = `Avance ${pct(a.avance_pct)} · HH consumidas ${pct(a.consumo_plan_pct)} del plan`
  const consumo = Number(a.consumo_plan_pct ?? 0)
  const avance = Number(a.avance_pct)
  if (consumo - avance > 10) return `${texto} — consumo adelantado`
  if (avance - consumo > 10) return `${texto} — rinde mejor que el plan`
  return texto
}

/**
 * Las horas que le cruzan a cada asignado. Devuelve un mapa `asignacion.id → horas`.
 *
 * ═══ EL CRUCE ES POR ID, NO POR NOMBRE ═══
 *
 * Hasta el 19/08/2026 se comparaban nombres normalizados, porque `registros_hh` guardaba
 * `trabajador_o_cuadrilla` en texto libre. Con un apodo, una tilde o un segundo nombre, las horas de
 * esa persona desaparecían de su fila SIN UN ERROR: la columna decía «—» y se leía como que no había
 * trabajado.
 *
 * Y el cruce respeta la ACTIVIDAD: si la asignación es a una actividad concreta, sólo cuentan las
 * horas imputadas a esa actividad. Sumarle todas las de la obra haría que la misma hora apareciera
 * dos veces cuando alguien está asignado a dos actividades, y el total de la tabla dejaría de cerrar
 * contra el titular.
 */
export function horasPorAsignado(asignaciones: Asignacion[], registros: RegistroHH[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of asignaciones) {
    const suma = registros
      .filter((r) => r.persona_id != null
        && r.persona_id === a.persona_id
        && (a.actividad_id == null || r.actividad_id === a.actividad_id))
      .reduce((s, r) => s + Number(r.horas), 0)
    if (suma > 0) m.set(a.id, suma)
  }
  return m
}
