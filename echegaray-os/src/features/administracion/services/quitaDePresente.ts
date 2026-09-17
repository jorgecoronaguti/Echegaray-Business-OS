// QUITAR EL PRESENTE Y LA JORNADA QUE ESE PRESENTE ESCRIBIÓ — DECISIÓN 3 DEL DUEÑO (confirmada 17/09/2026).
//
// ═══ POR QUÉ ES UNA CONSTANTE Y UN PARÁMETRO ═══
//
// Desde el 08/09 dar «Está» escribe la jornada por defecto (`planDeHorasPorDefecto`), y desde el 10/09
// quitar la marca NO tocaba `registros_hh`. Consecuencia medible: un toque equivocado en «Está» y su
// corrección dejaban 9 h imputadas a la obra sobre un día «sin marcar», que nadie iba a buscar. El
// dueño confirmó: «al quitar un presente se borran las horas por defecto salvo que alguien las haya
// editado». La constante apaga la regla entera. El PARÁMETRO de la acción (`quitar_jornada_por_defecto`)
// existe porque en este hito las pantallas viejas no cambian de comportamiento: sólo la carga única lo
// pide. Cuando el hito 2 las retire, el default de la acción pasa a `true`.
//
// ═══ LO QUE NUNCA SE BORRA ═══
//
// Una hora que escribió una persona. El criterio es `esDefectoQueNadieMiro` —el MISMO que usa
// «No vino» para retirar la jornada por defecto—: origen `web:presencia-defecto` Y sin
// `actualizado_por`. La fila que alguien corrigió a 13 h conserva el origen viejo pero tiene autor, y
// esa diferencia es la que ya costó unas horas borradas en silencio el 11/09.

import { esDefectoQueNadieMiro, type HoraDelDia } from './presenciaDelDia.ts'

export const QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR = true

/** Los `id` de `registros_hh` que se retiran al quitar el presente de `personaId`. Pura. */
export function jornadaAQuitarConElPresente(
  horasDelDia: readonly HoraDelDia[], personaId: string, activo: boolean = QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR,
): string[] {
  if (!activo) return []
  return horasDelDia.filter((h) => h.persona_id === personaId && esDefectoQueNadieMiro(h)).map((h) => h.id)
}

/** El acuse de la quita, con lo que la base DEVOLVIÓ. Nunca «se quitaron las horas» si no se quitó nada. */
export function acuseDeQuita({ retiradas, noSePudo }: { retiradas: number; noSePudo: string | null }): string {
  const base = 'Marca quitada: el día quedó sin marcar.'
  if (noSePudo) return `${base} La jornada por defecto quedó cargada: ${noSePudo}`
  if (retiradas > 0) return `${base} Se retiró la jornada por defecto que había escrito el presente.`
  return `${base} Las horas cargadas a mano no se tocaron.`
}
