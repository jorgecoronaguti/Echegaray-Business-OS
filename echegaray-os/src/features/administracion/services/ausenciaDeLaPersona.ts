// UNA AUSENCIA ES DE LA PERSONA, NO DE UNA OBRA.
//
// Reemplaza a `obraDeLaAusencia.ts`, que deducía a qué obra imputarle una ausencia. El dueño lo
// rechazó el 08/09/2026, textual, ante el acuse «La ausencia quedó imputada a La Estrella: es donde
// ya estaban las horas de ese día»: *«eso no está ok, porque La Estrella es cliente y no tiene obra
// activa; si la persona está ausente, se le suma hs pero porque corresponde por ley, no
// necesariamente sumarle a ninguna obra»*.
//
// La regla, entonces: **la ausencia y la licencia se registran SIN obra. Sus horas cuentan para la
// PERSONA —las que corresponden por ley— y nunca son costo de una obra.**
//
// Aquella deducción no era un capricho de diseño: existía porque la base no aceptaba otra cosa
// (`hh_insert_por_obra` exigía `obra_canonica_id is not null`). La migración `20260908T2000` sacó
// esa obligación, y este archivo es lo que queda de la regla del lado del código: puro, sin base y
// sin sesión, para que se pruebe entero sin Supabase arriba.

/** Una fila del día de esa persona, mirada por esta regla. Es `FilaExistente` + su obra. */
export interface FilaDelDia {
  id: string
  tipo_hora: string
  horas: number | string
  obra_canonica_id: string | null
}

/** La fila SIN obra que ya existe para ese día, o `null`. Es la que se corrige en vez de duplicar. */
export function ausenciaSinObraDe(filas: readonly FilaDelDia[]): FilaDelDia | null {
  return [...filas]
    .filter((f) => f.obra_canonica_id === null && (f.tipo_hora === 'ausencia' || f.tipo_hora === 'licencia'))
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
}

/**
 * Las horas que vale una ausencia.
 *
 * ═══ DATO PENDIENTE, DECLARADO ═══
 *
 * Lo correcto es la jornada legal de LA PERSONA, que depende de su categoría UOCRA. Ese dato no
 * existe hoy en el OS: la única jornada cargada es `obra_canonica.jornada_horas`, o sea la de una
 * OBRA. Se usa esa como aproximación —la de la obra donde se la espera ese día— y queda anotado
 * acá: **la jornada legal por categoría es un dato pendiente**. Mientras no exista, una ausencia de
 * alguien sin ninguna obra de referencia vale la jornada estándar declarada abajo.
 *
 * No se usa 0: `registros_hh` exige `horas > 0`, y además el dueño lo dijo al revés — «se le suma
 * hs porque corresponde por ley». Un cero diría que ese día no le corresponde nada.
 */
export const JORNADA_ESTANDAR_HS = 8

export function horasDeLaAusencia(
  pedidas: number | null | undefined,
  jornadaDeSuObra: number | null | undefined,
): number {
  if (typeof pedidas === 'number' && pedidas > 0) return pedidas
  const jornada = Number(jornadaDeSuObra)
  return Number.isFinite(jornada) && jornada > 0 ? jornada : JORNADA_ESTANDAR_HS
}

/** Lo que la base hizo con la ausencia. Nunca la intención: el acuse cuenta el efecto. */
export interface EscrituraDeLaAusencia {
  /** `null` cuando la fila ya estaba igual y no hubo nada que escribir. */
  fila: 'insertada' | 'actualizada' | null
  /** Horas que estaban cargadas en obras ese día y se sacaron: no trabajó. */
  horasSacadas: number
  /** Los nombres reales de esas obras. Vacío si no había nada cargado. */
  obrasSacadas: string[]
  /** Lo que NO se tocó (extras, improductivas, imputaciones a una actividad) y por qué. */
  intactas: readonly { motivo: string }[]
}

/**
 * El acuse de una corrección a «no vino».
 *
 * ═══ LO QUE YA NO PUEDE DECIR ═══
 *
 * «La ausencia quedó imputada a …». Esa frase es la que el dueño rechazó, y no se elimina sola: se
 * reemplaza por la afirmación contraria, explícita, para que nadie vaya a buscar el día en una obra.
 */
export function acuseDeAusencia(e: EscrituraDeLaAusencia): string {
  const cabeza = e.fila === null
    ? 'No cambió nada en la base: el día ya estaba así.'
    : 'Día corregido: no vino. La ausencia es de la persona; no se cargó a ninguna obra.'
  const partes = [cabeza]
  // LAS HORAS QUE SE SACAN SE NOMBRAN, CON SU OBRA. Si alguien tenía el día cargado en una obra y
  // se corrige a «no vino», esas horas dejan de existir como costo de esa obra. Borrarlas en
  // silencio es exactamente lo que este repo prohíbe: el efecto se declara.
  if (e.horasSacadas > 0) {
    const donde = e.obrasSacadas.length > 0 ? ` en ${e.obrasSacadas.join(' y ')}` : ''
    partes.push(`Se sacaron las ${e.horasSacadas} hs que tenía cargadas${donde}: ese día no trabajó.`)
  }
  if (e.intactas.length > 0) {
    const [primera] = e.intactas
    partes.push(e.intactas.length === 1
      ? `Quedó sin tocar una fila: ${primera.motivo}.`
      : `Quedaron ${e.intactas.length} filas sin tocar (una ${primera.motivo}).`)
  }
  return partes.join(' ')
}

/** Las horas de las filas que se sacan. `horas` viaja como TEXTO desde PostgREST (es `numeric`). */
export function sumarHoras(filas: readonly FilaDelDia[], ids: readonly string[]): number {
  const buscados = new Set(ids)
  return filas.filter((f) => buscados.has(f.id))
    .reduce((total, f) => total + (Number(f.horas) || 0), 0)
}
