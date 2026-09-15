// DEJAR UN DÍA SIN HORAS — la regla que comparten todos los cuadros que escriben horas.
//
// El dueño, 15/09/2026: *«no me permite dejar sin hs un día, sin ni siquiera ponerle ausente, quiero
// dejar sin hs una celda para completar más tarde; arreglar eso en TODOS los cuadros que tengan hs»*.
//
// ═══ «SIN HORAS» NO ES CERO NI AUSENTE, Y NO DEJA MARCA ═══
//
// `registros_hh` exige `horas > 0`, así que el día sin horas es el día SIN FILA: se borra la jornada
// y no se escribe nada en su lugar. No hace falta una marca de «pendiente»: la presencia declarada
// —si la había— queda como estaba, y un presente sin horas ya es lo que Liquidación cuenta como
// `presentesSinHoras`. La jornada por defecto no lo vuelve a llenar porque sólo se escribe al
// DECLARAR la presencia, no al volver a guardarla (`planDeHorasPorDefecto`). La planilla JORNALES sí
// puede completar el hueco: no hay nada que la frene, y es el «completar más tarde» del pedido.
//
// ═══ SÓLO LA JORNADA TRABAJADA ═══
//
// Se vacían las horas `normal` sin actividad ni causa improductiva. Una ausencia, una licencia, unas
// extras o una imputación al plan de obra son hechos que alguien declaró aparte: vaciar la celda no
// los decide. Quedan, y el acuse los nombra — igual que `planDeBorrado`.

import { motivoDeNoTocar, type FilaExistente } from './planDeJornada.ts'

export interface PlanDeVaciado {
  borrar: string[]
  intactas: { id: string; motivo: string }[]
}

type FilaDeVaciado = FilaExistente & { obra_canonica_id?: string | null }

const esHoraDeJornada = (e: FilaDeVaciado): boolean =>
  e.tipo_hora === 'normal' && !e.actividad_id && e.improductiva !== true

/**
 * Qué filas se borran para dejar sin horas el día de esas personas. `obra` acota a la obra de la
 * celda: vaciar la fila de Messina no puede llevarse las horas que la misma persona tiene ese día en
 * otra obra. `null` = sin acotar (la celda de Liquidación ya es el día entero de la persona).
 */
export function planDeVaciado(
  existentes: readonly FilaDeVaciado[], personas: readonly string[], obra: string | null,
): PlanDeVaciado {
  const quienes = new Set(personas)
  const delDia = [...existentes]
    .filter((e) => quienes.has(e.persona_id))
    .filter((e) => obra === null || e.obra_canonica_id === undefined || e.obra_canonica_id === obra)
    .sort((a, b) => a.id.localeCompare(b.id))
  return {
    borrar: delDia.filter(esHoraDeJornada).map((e) => e.id),
    intactas: delDia.filter((e) => !esHoraDeJornada(e)).map((e) => ({ id: e.id, motivo: motivoDeNoTocar(e) })),
  }
}

/** El acuse. Cuenta lo que la BASE borró y nombra lo que quedó: «sin horas» con una extra al lado no
 *  es un día vacío, y decirlo así sería el verde inventado que el resto de estas pantallas evita. */
export function acuseDeVaciado(borradas: number, intactas: readonly { motivo: string }[]): string {
  const cabeza = borradas === 0
    ? 'El día ya estaba sin horas.'
    : 'Día sin horas: queda para completar más tarde.'
  if (intactas.length === 0) return cabeza
  return `${cabeza} Quedó sin tocar: ${intactas[0].motivo}${intactas.length > 1 ? ` (y ${intactas.length - 1} más)` : ''}.`
}
