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

import { jornadaPorDefecto } from './jornadaPorDefecto.ts'
import { tipoDeMotivo } from './motivoDeAusencia.ts'
import { correrDias, esDomingo, nombreDia } from './quincena.ts'

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
 * La jornada de referencia cuando no hay ninguna otra.
 *
 * ═══ DATO PENDIENTE, DECLARADO ═══
 *
 * Lo correcto es la jornada legal de LA PERSONA, que depende de su categoría UOCRA. Ese dato no
 * existe hoy en el OS: la única jornada cargada es `obra_canonica.jornada_horas`, o sea la de una
 * OBRA. Se usa esa como aproximación —la de la obra donde se la espera ese día— y queda anotado
 * acá: **la jornada legal por categoría es un dato pendiente**. Mientras no exista, una ausencia de
 * alguien sin ninguna obra de referencia vale la jornada estándar.
 *
 * ═══ CUÁNTAS HORAS SE LE RECONOCEN NO SE DECIDE ACÁ ═══
 *
 * Esto es una JORNADA —cuánto dura el día de trabajo—, no una liquidación. Que un día no trabajado
 * se pague o no lo decide `horasDeAusencia` en `liquidacionDeAusencias.ts`, con la tabla del motivo
 * (dueño, 08/09/2026 18:50: «ausencia sin motivo es cero hs»). Acá vivía `horasDeLaAusencia`, que
 * devolvía SIEMPRE esta jornada porque la base exigía `horas > 0`; se retiró con la migración
 * `20260908T2400` en vez de dejarla al lado de la nueva: dos definiciones de cuánto vale una
 * ausencia discrepan el día que alguien toca una sola.
 */
export const JORNADA_ESTANDAR_HS = 8

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

/** Lo mínimo que esta regla necesita saber del día que se está corrigiendo. Estructural a propósito:
 *  atarla a `CeldaObra` traería la grilla entera adentro de una regla que se prueba sin pantalla. */
export interface DiaMirado {
  estado: string
  horas: number | null
}

/**
 * Las horas que el campo «Horas que corresponden» muestra PARA ESE DÍA: las que ya están
 * registradas si el día es una ausencia, y si no la jornada de referencia.
 *
 * ═══ POR QUÉ VIVE ACÁ Y NO EN EL PANEL ═══
 *
 * Estaba adentro de `PanelCorreccionJornada` y sólo corría al montar: elegir otro día cambiaba la
 * fecha, el estado y las horas trabajadas, pero el campo seguía mostrando las horas del PRIMER día
 * (lunes = 9) aunque se hubiera elegido un viernes, que vale 8. Verificado en producción el
 * 08/09/2026 con dos personas. Como regla pura se prueba sin navegador: la misma celda, dos fechas,
 * dos resultados.
 */
export function horasDeLaAusenciaVisibles(
  fecha: string,
  celda: DiaMirado | null,
  tramos: readonly { obra_id: string }[],
  /** Su obra vigente: la última candidata antes de la jornada estándar, igual que en el servidor. */
  obraVigente: string | undefined,
  jornadaPorObra: Record<string, number>,
): number {
  if ((celda?.estado === 'ausente' || celda?.estado === 'licencia') && celda.horas !== null) {
    return celda.horas
  }
  // LA JORNADA POR DEFECTO ES DEL DÍA DE LA SEMANA (dueño, 08/09/2026): 9 hs de lunes a jueves, 8
  // los viernes. Va PRIMERA, antes que `jornada_horas` de la obra: aquélla es la jornada de un
  // contrato de obra y ésta es la de la persona, que es de quien es la ausencia. El sábado no tiene
  // default y ahí siguen valiendo las candidatas de siempre.
  return jornadaDeReferenciaVisible([
    jornadaPorDefecto(fecha),
    ...tramos.map((t) => jornadaPorObra[t.obra_id]),
    obraVigente ? jornadaPorObra[obraVigente] : null,
  ])
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
  /** Las horas que quedaron reconocidas por ley. `0` cuando el motivo no se paga — y el acuse lo
   *  dice, porque «quedó registrado» sin decir cuánto vale es la mitad del hecho. */
  horas?: number
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
  // CUÁNTO VALE EL DÍA, EN EL ACUSE. El dueño, 08/09/2026: «ausencia sin motivo es cero hs». Que la
  // liquidación sea determinista no alcanza si quien marca no se entera de lo que acaba de decidir.
  if (e.fila !== null && typeof e.horas === 'number') {
    partes.push(e.horas > 0
      ? `Se le reconocen ${e.horas} hs: el motivo se paga.`
      : 'No suma horas: es una ausencia sin motivo que se pague.')
  }
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UN TRAMO: LA AUSENCIA QUE YA SE SABE CUÁNTO VA A DURAR
//
// El dueño, 08/09/2026 16:51, textual: *«no está arreglado lo de la ausencia por motivo de
// enfermedad o accidente de trabajo: si ya sé que no va a haber por X cantidad de días, ya puedo
// dejarlo asentado»*. Un parte médico de diez días o un accidente con alta prevista se sabe el
// primer día: obligar a volver cada mañana a marcar el mismo día es lo que hacía que no se marcara.
//
// ═══ POR QUÉ UNA FILA POR DÍA Y NO UNA FILA CON DOS FECHAS ═══
//
// Porque `registros_hh` es el libro de las horas de cada día y TODO lo que lee la empresa —la
// grilla, la quincena, la liquidación, el ausentismo por causa— pregunta por día. Una fila «del 9
// al 19» obligaría a cada uno de esos lectores a saber expandir un rango, y el primero que se
// olvide publica un mes con nueve días de menos. El tramo es de la PANTALLA; la base sigue siendo
// un día, una fila.
//
// ═══ EL DOMINGO NO SE ASIENTA ═══
//
// Misma regla que la grilla (`diasDeLaQuincenaSinDomingos`): el domingo no se trabaja, así que no
// se le puede reconocer una ausencia. Asentarlo sumaría horas de un día que no existe para nadie.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Una fila del rango, con SU día: el tramo mira varios y sin la fecha no se sabe cuál es cuál. */
export interface FilaDelTramo extends FilaDelDia {
  fecha: string
}

/**
 * El tope del tramo, en días de calendario.
 *
 * No es una restricción técnica: es la puerta contra el error de tipeo. Un `2027` en vez de `2026`
 * en el campo de fecha escribiría 365 filas de licencia sin que nadie lo pida, y el acuse las
 * contaría como un éxito. Sesenta días cubre el parte médico más largo que la empresa maneja hoy.
 */
export const TOPE_DE_TRAMO_DIAS = 60

export interface DiaDelTramo {
  fecha: string
  /** Las horas de ESE día. No son las mismas todos los días: el viernes son 8 y de lunes a jueves
   *  9 (`jornadaPorDefecto`, regla del dueño del 08/09/2026). */
  horas: number
  /** `null` es un insert; con id se corrige la fila SIN obra que ese día ya tenía. */
  id: string | null
  /** Filas EN OBRA de ese día que se reemplazan: no trabajó. */
  sacar: string[]
  /** Lo de ese día que NO se toca, y por qué. */
  intactas: { motivo: string }[]
  /** Ese día ya decía exactamente esto. No se reescribe — y el acuse puede decir que no cambió. */
  sinCambio: boolean
}

export type PlanDeTramo =
  | { ok: true; dias: DiaDelTramo[] }
  | { ok: false; error: string }

/**
 * Qué se escribe, qué se saca y qué ya estaba, día hábil por día hábil del tramo.
 *
 * ═══ EL CRITERIO DE QUÉ SE SACA VIENE DE AFUERA ═══
 *
 * `sacarDeLaObra` es `planDeBorrado` —el criterio de la OBRA: una hora improductiva con su causa,
 * unas extras o una imputación a una actividad del plan no se las lleva puestas nadie—. Se inyecta
 * en vez de importarse para que este archivo siga sin depender del plan de la obra: acá vive lo que
 * pasa FUERA de toda obra, y son dos listas de ids que se aplican a consultas distintas.
 */
export function planDeTramoDeAusencia<F extends FilaDelTramo>(e: {
  desde: string
  hasta: string
  /** Las horas que corresponden por ley, resueltas POR DÍA por quien llama. Se pasa como función y
   *  no como número porque la jornada por defecto es del día de la semana —9 de lunes a jueves, 8
   *  los viernes—: un solo número para todo el tramo le regalaría una hora a cada viernes. */
  horasDelDia: (fecha: string) => number
  motivo: string | null
  tipo: 'ausencia' | 'licencia'
  /** Todo lo que esa persona tiene cargado entre `desde` y `hasta`, ambos incluidos. */
  existentes: readonly F[]
  sacarDeLaObra: (filas: F[]) => { borrar: string[]; intactas: { motivo: string }[] },
}): PlanDeTramo {
  if (e.hasta < e.desde) {
    return { ok: false, error: 'El «hasta» es anterior al día elegido: un tramo no va para atrás.' }
  }
  if (diasEntre(e.desde, e.hasta) > TOPE_DE_TRAMO_DIAS) {
    return {
      ok: false,
      error: `Un tramo no puede pasar de ${TOPE_DE_TRAMO_DIAS} días. Si de verdad son más, se `
        + 'asienta por partes: así un año escrito de más en la fecha no se convierte en 365 filas.',
    }
  }
  const dias: DiaDelTramo[] = []
  for (let f = e.desde; f <= e.hasta; f = correrDias(f, 1)) {
    if (esDomingo(f)) continue
    const delDia = e.existentes.filter((x) => x.fecha === f)
    const ya = ausenciaSinObraDe(delDia)
    const { borrar, intactas } = e.sacarDeLaObra(delDia.filter((x) => x.obra_canonica_id !== null))
    const horas = e.horasDelDia(f)
    dias.push({
      fecha: f,
      horas,
      id: ya?.id ?? null,
      sacar: borrar,
      intactas,
      // SIN CAMBIO ES TAMBIÉN «Y NO HAY NADA QUE SACAR». Un día con la licencia ya puesta pero con
      // horas cargadas en una obra sigue estando mal: hay que sacar esas horas, y saltearlo dejaría
      // el día contado dos veces.
      sinCambio: ya !== null && borrar.length === 0 && ya.tipo_hora === e.tipo
        && Number(ya.horas) === horas && (ya.notas ?? null) === e.motivo,
    })
  }
  if (dias.length === 0) {
    return { ok: false, error: 'Ese tramo no tiene ningún día hábil: los domingos no se asientan.' }
  }
  return { ok: true, dias }
}

/** Hasta dónde puede llegar el campo «Hasta»: es el `max` del `<input type=date>`, o sea la misma
 *  puerta del tope pero un paso antes — la pantalla no ofrece lo que el servidor va a rechazar. */
export const topeDelTramo = (desde: string): string => correrDias(desde, TOPE_DE_TRAMO_DIAS)

/**
 * El sábado de esa semana: hasta dónde llega el chip «Resto de la semana».
 *
 * Sábado y no viernes porque el sábado es LABORABLE (la grilla lo dibuja y se marca si se trabajó);
 * el domingo no entra ni acá ni en el plan. Un `desde` que ya es sábado devuelve ese mismo día:
 * «el resto de la semana» de un sábado es el sábado.
 */
export function restoDeLaSemana(desde: string): string {
  const dow = new Date(`${desde}T00:00:00Z`).getUTCDay()
  return dow === 0 ? desde : correrDias(desde, 6 - dow)
}

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000)

/**
 * `mié 09/09`. El día de la semana va porque un tramo se revisa contra el parte médico, que habla
 * de días, y `09/09` solo no deja ver que el sábado entró y el domingo no.
 *
 * SE EXPORTA porque la pantalla necesita decir la MISMA fecha que el acuse: el `<input type="date">`
 * la dibuja con el formato de la máquina —`12/09/2026` o `09/12/2026` según cuál sea— y el panel
 * escribe esta línea al lado para sacar la ambigüedad. Dos formatos distintos para la misma fecha
 * en la misma pantalla es exactamente lo que confundía.
 */
export const fechaLegibleCorta = (fecha: string): string =>
  `${nombreDia(fecha).slice(0, 3)} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`

/** Lo que la base hizo con el tramo. Nunca lo que se le pidió. */
export interface EscrituraDelTramo {
  tipo: 'ausencia' | 'licencia'
  desde: string
  hasta: string
  /** Días hábiles que QUEDARON asentados: escritos ahora o ya iguales de antes. */
  asentados: number
  /** La etiqueta del motivo, como se lee en la pantalla. */
  motivo: string | null
  horasSacadas: number
  obrasSacadas: string[]
  /** Los días que la policy rechazó: la persona no tenía asignación vigente ese día. */
  rechazados: string[]
}

/**
 * El acuse del tramo.
 *
 * Dice el período, cuántos días hábiles quedaron y por qué causa, y repite la frase que impide que
 * alguien vaya a buscar esos días en una obra. LOS DÍAS QUE NO ENTRARON SE NOMBRAN UNO POR UNO: un
 * tramo que entró a medias y se acusa como completo es peor que uno rechazado entero, porque nadie
 * vuelve a mirarlo.
 */
export function acuseDeTramo(e: EscrituraDelTramo): string {
  const que = e.tipo === 'licencia' ? 'Licencia' : 'Ausencia'
  const causa = e.motivo ? ` · ${e.motivo}` : ''
  const partes: string[] = []
  if (e.asentados > 0) {
    partes.push(`${que} asentada del ${fechaLegibleCorta(e.desde)} al ${fechaLegibleCorta(e.hasta)}: ${e.asentados} `
      + `${e.asentados === 1 ? 'día hábil' : 'días hábiles'}${causa}.`)
    partes.push('La ausencia es de la persona; no se cargó a ninguna obra.')
  } else {
    partes.push(`No se asentó ningún día del ${fechaLegibleCorta(e.desde)} al ${fechaLegibleCorta(e.hasta)}.`)
  }
  if (e.horasSacadas > 0) {
    const donde = e.obrasSacadas.length > 0 ? ` en ${e.obrasSacadas.join(' y ')}` : ''
    partes.push(`Se sacaron las ${e.horasSacadas} hs que tenía cargadas${donde}: no trabajó esos días.`)
  }
  if (e.rechazados.length > 0) partes.push(sinAsignacionVigente(e.rechazados))
  return partes.join(' ')
}

/** LA POLICY RECHAZÓ ESOS DÍAS, Y SE DICE POR QUÉ. `42501` sobre una fila sin obra es siempre lo
 *  mismo: el jefe sólo puede declarar la ausencia de quien esté asignado A ESA FECHA a una obra que
 *  él ve, y un tramo que se va más allá del fin de la asignación choca justo ahí. */
function sinAsignacionVigente(fechas: readonly string[]): string {
  const cortas = fechas.map((f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`)
  if (cortas.length === 1) {
    return `No podés asentar el ${cortas[0]}: la persona no tiene asignación vigente ese día.`
  }
  const visibles = cortas.slice(0, 4).join(', ')
  const resto = cortas.length > 4 ? ` y ${cortas.length - 4} más` : ''
  return `No podés asentar el ${visibles}${resto}: la persona no tiene asignación vigente esos días.`
}
