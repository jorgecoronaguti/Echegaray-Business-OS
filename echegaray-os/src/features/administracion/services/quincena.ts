// LA QUINCENA — el período con el que se paga, calculado sin base y sin pantalla.
//
// Los jornales se liquidan por quincena: del 1 al 15 y del 16 al último día del mes. La grilla de
// asistencia de Administración se mira por ese período y no por semana porque el número que produce
// —cuántas horas puso cada persona en cada obra— termina cerrando contra una liquidación, y una
// ventana lunes→domingo no coincide con ninguna: obliga a sumar dos semanas y media a mano y a
// decidir qué hacer con la semana que cruza el 15.
//
// ═══ NO HAY UNA SEGUNDA DEFINICIÓN DE QUINCENA ═══
//
// El corte sale de `ventanaDe('quincena')`, la misma que usa la ficha de la persona y la que refleja
// el Sheet de JORNALES. Reescribir acá «del 1 al 15» haría que la ficha y esta grilla discreparan el
// día que alguien cambie una de las dos, y nadie lo vería hasta que los totales no cerraran.
//
// ═══ EL SÁBADO SIN MARCAR NO ES UN OLVIDO ═══
//
// La grilla semanal dibujaba lunes a viernes: los fines de semana no existían y no se reclamaban.
// La quincena los incluye por definición, así que si no se los declara no laborables, cada domingo
// entra a la grilla como «sin marcar» —el rojo que significa «alguien se olvidó de cargar esto»— y
// la pantalla pasa a reclamar cuatro días falsos por quincena. Un sábado trabajado se sigue viendo:
// lo DECLARADO manda sobre el calendario, es el mismo orden de preguntas de siempre.

import { ventanaDe, type Ventana } from './periodoHH.ts'

/** El período de la grilla. Es una `Ventana` de `periodoHH`: no hay un tipo nuevo para lo mismo. */
export type Quincena = Ventana

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * El día vecino, `n` días después (o antes con `n` negativo).
 *
 * Se exporta porque el tramo de una ausencia (`ausenciaDeLaPersona.ts`) recorre días igual que la
 * quincena, y una segunda aritmética de fechas en otro archivo discrepa el día que alguien toque
 * una sola: sumar sobre `Date` local cruza el cambio de hora, sobre UTC no.
 */
export const correrDias = (fecha: string, n: number): string => {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** `2026-09-08` — lo que puede venir de la URL. Todo lo demás vuelve a la quincena de hoy. */
export const esFechaISO = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))

/** La quincena que CONTIENE esa fecha. */
export const quincenaDe = (fecha: string): Quincena => ventanaDe('quincena', fecha)

/**
 * La quincena anterior (`-1`) o la siguiente (`+1`).
 *
 * Se salta por el DÍA VECINO al borde y se vuelve a preguntar en qué quincena cae, en vez de sumar
 * quince días: sumar quince al 16 de enero cae el 31 —la misma quincena— y sumar quince al 16 de
 * febrero se pasa al 3 de marzo. El largo de la segunda quincena cambia con el mes (13 días en
 * febrero, 16 en los de 31) y el fin de año no es un caso especial si nadie lo trata como tal.
 */
export function correrQuincena(q: Quincena, n: number): Quincena {
  let actual = q
  for (let i = 0; i < Math.abs(n); i++) {
    actual = quincenaDe(n > 0 ? correrDias(actual.hasta, 1) : correrDias(actual.desde, -1))
  }
  return actual
}

/**
 * Los días CALENDARIO de la quincena, domingos incluidos. 15 los primeros; 13 a 16 los segundos.
 *
 * NO ES LO QUE DIBUJA LA PANTALLA — para eso está `diasDeLaQuincenaSinDomingos`. Sigue existiendo
 * porque el rango completo es lo que define la ventana que se le pide a la base: si la consulta
 * salteara los domingos, un registro cargado en domingo dejaría de leerse y la cronología —que sí
 * lo muestra— no lo tendría.
 */
export function diasDeQuincena(q: Quincena): string[] {
  const dias: string[] = []
  for (let f = q.desde; f <= q.hasta; f = correrDias(f, 1)) dias.push(f)
  return dias
}

const diaDeLaSemana = (fecha: string): number => new Date(`${fecha}T00:00:00Z`).getUTCDay()

/**
 * ═══ EL DOMINGO NO EXISTE EN LA GRILLA ═══
 *
 * El dueño, 08/09/2026: *«los domingos no se trabaja, borralos de la consideración de todos
 * lados»*. Dibujarlo como «no laborable» ya no alcanza: dos columnas de guiones por quincena
 * ocupan el ancho que necesitan los días que sí se cargan, y obligan a leer catorce casillas para
 * contar doce jornadas.
 *
 * Es UNA función y no un `filter` repetido en cada pantalla: el día que aparezca una excepción
 * —un domingo trabajado que haya que declarar— se decide en un solo lugar. El SÁBADO SIGUE: es
 * laborable, se dibuja atenuado y se marca si se trabajó.
 *
 * ESCONDER LA COLUMNA NO BORRA EL DATO. Al 08/09/2026 `registros_hh` no tiene ni una fila en
 * domingo (0 de 5.000), pero si alguna vez la tiene, la fila queda en la base y la cronología de
 * la ficha la muestra: la grilla deja de reclamar un día, no de leerlo.
 */
export const esDomingo = (fecha: string): boolean => diaDeLaSemana(fecha) === 0

/** Las columnas de la grilla: la quincena sin sus domingos. 13 en una de 15 días con dos. */
export function diasDeLaQuincenaSinDomingos(q: Quincena): string[] {
  return diasDeQuincena(q).filter((f) => !esDomingo(f))
}

export const esFinDeSemana = (fecha: string): boolean =>
  diaDeLaSemana(fecha) === 0 || diaDeLaSemana(fecha) === 6

/**
 * Los días que la grilla NO reclama: los feriados de `calendario_no_laborable` MÁS los sábados y
 * domingos. Es una unión y no un reemplazo: un feriado que cae martes sigue siendo feriado.
 */
export function noLaborablesDe(dias: string[], feriados: string[]): string[] {
  const s = new Set(feriados)
  for (const d of dias) if (esFinDeSemana(d)) s.add(d)
  return [...s]
}

const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const NOMBRES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * `L 1`. Con dieciséis columnas no entra «LUN 01»: el encabezado tiene que caber en el ancho de una
 * celda de horas. La letra sola es ambigua entre martes y miércoles —las dos son M—, y por eso el
 * nombre completo viaja en `nombreDia` y la pantalla lo pone en el `title` de la columna.
 */
export const etiquetaDiaCorta = (fecha: string): string =>
  `${LETRAS[diaDeLaSemana(fecha)]} ${Number(fecha.slice(8, 10))}`

export const nombreDia = (fecha: string): string => NOMBRES[diaDeLaSemana(fecha)]

/**
 * `1ª quincena de septiembre · 1 al 15`.
 *
 * Los dos números van a la vista aunque el rótulo ya diga cuál es: un total sin su ventana escrita
 * no se puede verificar contra la liquidación, que es contra lo que se verifica.
 */
export function rotuloQuincena(q: Quincena): string {
  return `${cabeceraQuincena(q)} · ${Number(q.desde.slice(8, 10))} al ${Number(q.hasta.slice(8, 10))}`
}

/**
 * `1ª quincena de septiembre` — el período SIN sus dos números.
 *
 * Existe porque hay un caso donde los números del período mienten: cuando lo que se está mirando es
 * más angosto que la quincena (la ventana «Hoy» o «Semana»), escribir «1 al 15» al lado de un
 * subtotal de tres días afirma que la quincena entera sumó eso. La cabecera se reusa y los números
 * los pone quien sabe qué se está viendo.
 */
export function cabeceraQuincena(q: Quincena): string {
  const mes = MESES[Number(q.desde.slice(5, 7)) - 1]
  return `${Number(q.desde.slice(8, 10)) === 1 ? '1ª' : '2ª'} quincena de ${mes}`
}
