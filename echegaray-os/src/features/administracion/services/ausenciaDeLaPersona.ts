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

import { tipoDeMotivo } from './motivoDeAusencia.ts'

/** Una fila del día de esa persona, mirada por esta regla. Es `FilaExistente` + su obra. */
export interface FilaDelDia {
  id: string
  tipo_hora: string
  horas: number | string
  obra_canonica_id: string | null
  /** Sólo hace falta cuando las filas vienen de VARIAS personas (la carga del día de una cuadrilla).
   *  El panel de corrección lee el día de una sola y ahí no se usa. */
  persona_id?: string
  /** La clave del motivo guardada. Se compara para no reescribir una fila que ya está igual. */
  notas?: string | null
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

/**
 * La jornada de referencia que la PANTALLA muestra, con las candidatas que tenga a mano y en el
 * mismo orden que el servidor (`jornadaDeReferencia`): la obra donde el día ya está cargado, la
 * elegida en el formulario, y recién ahí la estándar.
 *
 * Existe porque el campo «Horas que corresponden» nace prellenado y un campo que nace vacío es un
 * campo que se guarda vacío: la ausencia terminaría sin las horas que sí corresponden por ley.
 */
export function jornadaDeReferenciaVisible(
  candidatas: readonly (number | null | undefined)[],
): number {
  for (const c of candidatas) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return JORNADA_ESTANDAR_HS
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA OTRA PUERTA: LA CARGA DEL DÍA (`guardarJornada`)
//
// El panel de corrección ya escribía la ausencia sin obra. La carga desde el teléfono y la «A» de
// la grilla la seguían escribiendo CON la obra del formulario — la misma regla, rota en la puerta
// por la que entra casi todo. Esta función es esa regla, para N personas de una vez y sin base.
//
// Lo que decide, y por qué acá y no en `planDeJornada.ts`: aquél es el plan DE LA OBRA (qué se
// inserta, corrige y borra en `obra_canonica_id = X`); esto es lo que pasa FUERA de toda obra. Dos
// listas de ids que se aplican a consultas distintas — juntarlas terminaría en un `delete` acotado
// por obra que no borra nada y acusa que sí.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que la pantalla afirma de una persona ese día. Estructural a propósito: `MarcaDeJornada` vive
 *  en `planDeJornada.ts` y no se importa acá para que este archivo no dependa del plan de la obra. */
export interface MarcaDelDia {
  persona_id: string
  estado: 'presente' | 'ausente'
  /** Ya resueltas con `horasDeLaAusencia` por quien llama: acá no se inventa ninguna jornada. */
  horas: number
  motivo?: string | null
}

export interface PlanSinObra {
  /** `id: null` es un insert; con id es la corrección de la fila sin obra que ya estaba. */
  escribir: { marca: MarcaDelDia; id: string | null; tipo: 'ausencia' | 'licencia' }[]
  /** Filas SIN obra que se sacan: la persona sí trabajó, o el día quedó contado dos veces. */
  borrar: string[]
  /** Ausencias que ya estaban exactamente así. No se reescriben: el acuse tiene que poder decir
   *  «no cambió nada», que es lo que distingue guardar de volver a mirar. */
  sinCambio: number
  /** Lo que NO se tocó y por qué. Hoy: una licencia sin obra vista desde la obra. */
  intactas: { id: string; motivo: string }[]
}

/**
 * Qué escribir y qué sacar FUERA de toda obra para las marcas de un día.
 *
 * ═══ LA LICENCIA NO SE PISA DESDE LA OBRA ═══
 *
 * Misma regla que `esDeLaJornada` en `planDeJornada.ts`: una licencia la autorizó Administración con
 * un papel atrás, y el jefe que marca «A» desde el teléfono no puede borrarla ni convertirla. Queda
 * intacta y se nombra. Tampoco se escribe una ausencia al lado: serían dos filas del mismo día.
 */
export function planDeAusenciasSinObra(
  marcas: readonly MarcaDelDia[], filasSinObra: readonly FilaDelDia[],
): PlanSinObra {
  const plan: PlanSinObra = { escribir: [], borrar: [], sinCambio: 0, intactas: [] }
  for (const m of marcas) {
    const suyas = [...filasSinObra.filter((f) => f.persona_id === m.persona_id)]
      .sort((a, b) => a.id.localeCompare(b.id))
    const licencia = suyas.find((f) => f.tipo_hora === 'licencia')
    if (licencia) {
      plan.intactas.push({
        id: licencia.id,
        motivo: 'tiene una licencia que autorizó Administración: se corrige desde ahí, no desde la obra',
      })
      continue
    }
    const ausencias = suyas.filter((f) => f.tipo_hora === 'ausencia')
    // UN DÍA NO SE CUENTA DOS VECES. La clave única de `registros_hh` no protege acá —dos filas con
    // `obra_canonica_id` NULL no colisionan en Postgres—, así que las de más se sacan siempre.
    for (const f of ausencias.slice(1)) plan.borrar.push(f.id)
    const [ya] = ausencias

    if (m.estado === 'presente') {
      // TRABAJÓ: la ausencia de ese día deja de ser cierta. Sin esto, escribir las horas encima de
      // una «A» dejaría las dos afirmaciones guardadas a la vez.
      if (ya) plan.borrar.push(ya.id)
      continue
    }
    const tipo = tipoDeMotivo(m.motivo ?? null)
    if (!ya) {
      plan.escribir.push({ marca: m, id: null, tipo })
      continue
    }
    const igual = Number(ya.horas) === m.horas && (ya.notas ?? null) === (m.motivo ?? null)
      && ya.tipo_hora === tipo
    if (igual) plan.sinCambio += 1
    else plan.escribir.push({ marca: m, id: ya.id, tipo })
  }
  return plan
}

/** Lo que la base hizo con las filas sin obra. Nunca la intención. */
export interface EscritoSinObra {
  insertadas: number
  actualizadas: number
  /** Filas sin obra que se sacaron porque la persona sí trabajó. */
  sacadas: number
  sinCambio: number
  intactas: readonly { motivo: string }[]
}

/**
 * El acuse de lo que pasó FUERA de la obra, o `null` si no hubo nada que decir.
 *
 * LA FRASE ES LA MISMA QUE LA DEL PANEL (`acuseDeAusencia`) y no es decorativa: es lo que impide que
 * alguien vaya a buscar el día en una obra. «Imputada a …» es exactamente lo que el dueño rechazó.
 */
export function acuseDeAusenciasDelDia(e: EscritoSinObra): string | null {
  const escritas = e.insertadas + e.actualizadas
  const partes: string[] = []
  if (escritas > 0) {
    partes.push(escritas === 1
      ? 'Ausencia registrada. La ausencia es de la persona; no se cargó a ninguna obra.'
      : `${escritas} ausencias registradas. La ausencia es de la persona; no se cargan a ninguna obra.`)
  }
  if (e.sacadas > 0) {
    partes.push(e.sacadas === 1
      ? 'Se sacó la ausencia que tenía ese día: trabajó.'
      : `Se sacaron ${e.sacadas} ausencias de ese día: esas personas trabajaron.`)
  }
  if (partes.length === 0 && e.sinCambio > 0) {
    partes.push('La ausencia ya estaba registrada así: no cambió nada en la base.')
  }
  if (e.intactas.length > 0) {
    const [primera] = e.intactas
    partes.push(e.intactas.length === 1
      ? `Quedó sin tocar una fila: ${primera.motivo}.`
      : `Quedaron ${e.intactas.length} filas sin tocar (una ${primera.motivo}).`)
  }
  return partes.length > 0 ? partes.join(' ') : null
}
