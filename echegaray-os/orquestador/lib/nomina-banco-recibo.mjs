// LA COLUMNA «BANCO» DEL CUADRO DE NÓMINA SALE DEL RECIBO, NO DE UN PORCENTAJE.
//
// ═══ LA ORDEN, TEXTUAL (31/08/2026) ═══
//
//   «por banco va lo q dice recibo y en efectivo se completa todo hasta llegar al numero.
//    en lo q respecta a estimar con aumento se deja fijo lo de banco y se pasa lo q haga falta
//    para llegar al monto con aumento todo via efectivo»
//
// Hasta hoy el cuadro calculaba la parte bancaria como el 50% del acuerdo. Para Aguero eso da
// $294.000 y el recibo dice $215.564,62: $78.435 que el cuadro mandaba al banco y en realidad se
// pagan en efectivo. El 50/50 sigue rigiendo el TOTAL de cada persona; lo que deja de ser un
// cálculo es el REPARTO.
//
// ═══ POR QUÉ EL PUENTE ES EXPLÍCITO Y NO POR NOMBRE ═══
//
// La planilla de jornales escribe «Zogber Leonardo», «Reta Sebastian», «Emanuel Alaniz». El recibo
// dice «ZOGBE RAMOS WALTER LEONARDO», «RETA RAMON HECTOR SEBASTIAN», «ALANIZ EMANUEL ARIEL». Ningún
// emparejamiento automático por nombre es seguro acá y el repo ya lo pagó: «Castillo Carlos» cayó
// en «GONZALEZ CARLOS SAMUEL» y «Gonzalez Juan» en «TELLO JUAN». Con plata de sueldo de por medio,
// un candidato no alcanza.
//
// Así que el puente es una TABLA DECLARADA, revisada persona por persona contra los 19 recibos de
// la 2da quincena de 08/2026, y la llave del recibo es el CUIL. Es más trabajo y es lo correcto:
// cuando entre alguien nuevo, el sistema va a decir que no lo conoce en vez de adivinar.

/** Persona de la planilla de jornales → su CUIL. Verificado contra el recibo, uno por uno. */
export const CUIL_POR_PERSONA_DE_PLANILLA = Object.freeze({
  'Aguero Cristian': '20294271067',
  'Emanuel Alaniz': '20382188153',
  'Gonzalez Carlos': '20355081886',
  'Gonzalez Emiliano': '20509455474',
  'Gonzalez Juan': '20314422555',
  // Legajo 95. No está en `personas` —es alta nueva— pero el CUIL lo trae su propio recibo, que es
  // la fuente que importa acá. Tenerlo en `null` hacía que su banco cayera a la planilla ($226.800)
  // cuando el recibo dice $67.794,80: $159.005 de más por transferencia.
  'Ochoa Eduardo': '20301119772',
  'Pastran Marcelo': '20251676462',
  'Petina Jairo': '23358514189',
  'Quiroga Alexander': '23445275549',
  'Quiroga Sebastian': '20305012905',
  'Reta Sebastian': '20311255712',
  'Rosales Diego': '20358508783',
  'Tello Juan': '20304020181',
  'Zogber Leonardo': '20291086021',
  // Los dos de oficina, que cobran recibo igual que los de obra.
  'Emi Maldonado': '20359232668',
  'Juan Pablo Nievas': '20403679764',
})

/**
 * TRANSFERENCIAS A UNA PERSONA QUE **NO** SON UN ADELANTO DE SUELDO.
 *
 * Que la plata salga de la cuenta hacia alguien del plantel no la convierte en un pago a cuenta. El
 * extracto no puede distinguirlo —dice importe, fecha y beneficiario— y el único que sabe qué era
 * es el dueño.
 *
 * Se declara **por la referencia del banco**, que es lo único que identifica un movimiento y sólo
 * uno: por (persona, fecha, importe) dos transferencias iguales el mismo día se leen como una, y
 * este repo ya pagó ese error con 68 duplicados.
 *
 * La clave es que descontar de un sueldo algo que no se adelantó es pagarle de menos a una persona.
 */
export const MOVIMIENTOS_QUE_NO_SON_ADELANTO = Object.freeze({
  // El dueño, 31/08/2026: «no considerar esa transfer de 40 a maldonado porque fue devolucion de
  // dinero, dejar en cero». Es plata que volvía a él, no un anticipo de su sueldo.
  77529957: 'devolución de dinero a Emiliano Maldonado — no es adelanto (dueño, 31/08/2026)',
})

/** ¿Este movimiento del extracto puede restarse de un sueldo? */
export const esAdelantoDeVerdad = (referencia) =>
  !Object.hasOwn(MOVIMIENTOS_QUE_NO_SON_ADELANTO, String(referencia ?? '').trim())

/**
 * QUIÉN ESTÁ EN LA PLANILLA Y NO COBRA ESTA QUINCENA, Y POR QUÉ.
 *
 * No es lo mismo «no tiene recibo porque se fue» que «no tiene recibo y no sabemos por qué». La
 * segunda es un hueco que alguien tiene que mirar antes de pagar.
 */
export const SIN_RECIBO_EN_LA_QUINCENA = Object.freeze({
  'Jofre Ismael': 'liquidación final el 25/08 — no cobra la 2da quincena',
  'Sosa Raul': 'liquidación final el 25/08 — no cobra la 2da quincena',
  'Castillo Carlos': 'FALTA_DATO: no tiene recibo en agosto y no hay baja registrada',
})

/**
 * ¿ESTA PERSONA YA COBRÓ SU LIQUIDACIÓN FINAL?
 *
 * Importa para una sola cosa y es cara: quien tiene liquidación final **no puede aparecer también
 * en el cuadro de la quincena**. La primera corrida los dejó en los dos —Jofre y Sosa con banco
 * $300.000 arriba y su liquidación completa abajo—, y un cuadro que muestra a la misma persona dos
 * veces con dos importes distintos es cómo se paga dos veces.
 *
 * La planilla de jornales los sigue trayendo porque tienen horas hasta el día de la baja. Tener
 * horas no es cobrar la quincena.
 */
export function tieneLiquidacionFinal(nombrePlanilla) {
  return /liquidación final/i.test(SIN_RECIBO_EN_LA_QUINCENA[nombrePlanilla] ?? '')
}

/**
 * COBRA RECIBO Y NO ESTÁ EN LA PLANILLA DE JORNALES.
 *
 * Su parte bancaria se conoce —la dice el recibo— pero su TOTAL no, porque el total sale de
 * `horas × $/hora` y nadie les cargó horas. Sin total no hay efectivo: `null`, nunca cero. Un cero
 * acá les paga sólo la parte registrada y se lee como si estuviera bien.
 */
export const COBRAN_Y_NO_ESTAN_EN_LA_PLANILLA = Object.freeze([
  { nombre: 'CASTRO JUAN MARCELO', legajo: '85', cuil: '20245269561' },
  { nombre: 'MORENO JULIO MIGUEL', legajo: '86', cuil: '20309892756' },
  { nombre: 'QUIROZ FACUNDO MIGUEL', legajo: '87', cuil: '20449917848' },
])

/**
 * EL BANCO DE UNA PERSONA PARA UNA QUINCENA. PURA.
 *
 * Devuelve `{ banco, fuente }`. Sin recibo devuelve `banco: null` — **no cero y no el 50%**: que
 * falte el recibo de alguien tiene que verse como un hueco, no resolverse con el cálculo viejo por
 * la puerta de atrás. Quien llame decide qué hacer con el nulo, y el cuadro lo muestra.
 */
export function bancoDeLaPersona(nombrePlanilla, recibosPorCuil = new Map()) {
  const cuil = CUIL_POR_PERSONA_DE_PLANILLA[nombrePlanilla]
  if (cuil === undefined) {
    const porQue = SIN_RECIBO_EN_LA_QUINCENA[nombrePlanilla]
    return { banco: null, fuente: porQue ?? `no está en el puente recibo↔planilla: nadie declaró el CUIL de «${nombrePlanilla}»` }
  }
  if (cuil === null) return { banco: null, fuente: `${nombrePlanilla} cobra recibo pero no tiene CUIL declarado en el puente` }
  const r = recibosPorCuil.get(cuil)
  if (!r || !(Number(r.neto) > 0)) return { banco: null, fuente: `sin recibo confirmado para el CUIL ${cuil}` }
  return { banco: Number(r.neto), fuente: `recibo ${r.etiqueta ?? ''}`.trim() }
}

/**
 * LOS QUE TIENEN LIQUIDACIÓN FINAL PERO NO SON PERSONAL.
 *
 * El dueño, 31/08/2026: «son todos subcontratistas de gerson castro, el formato fue asi de alta y
 * baja, pero son subcontratistas». O sea: existe el papel de liquidación final porque se los dio de
 * alta y de baja con esa forma, y la relación económica es otra.
 *
 * Importa para una cosa concreta: **el 50/50 es el acuerdo con el PERSONAL**. Aplicárselo a un
 * subcontratista sería inventarle una mitad en efectivo que nadie acordó — y son cinco personas por
 * $123.806,34 cada una, así que el invento serían $619.032 de la nada. Se muestran con lo que
 * liquidó el estudio y sin segunda mitad, hasta que el dueño diga otra cosa.
 */
export const SUBCONTRATISTAS_CON_LIQUIDACION = Object.freeze({
  'AVILA ALEJANDRO LUIS': 'subcontratista de Gerson Castro',
  'CASTRO GALVAN GERSON ULISES': 'subcontratista — es el titular del grupo',
  'CASTRO GALVAN HEBER LUCAS': 'subcontratista de Gerson Castro',
  'DIAZ RAMON ORLANDO': 'subcontratista de Gerson Castro',
  'FLORES ALEJANDRO NAZARENO': 'subcontratista de Gerson Castro',
})

/**
 * EL NOMBRE, ESCRITO SIEMPRE IGUAL: APELLIDO Y NOMBRES, EN MAYÚSCULA.
 *
 * El dueño: «no mezcles nombres con apellidos, necesito orden alfabetico claro […] uniformidad en
 * como se estan escribiendo las cosas». La planilla escribe «Aguero Cristian» y «Emanuel Alaniz» —
 * apellido primero en unos, nombre primero en otros— y el recibo los escribe todos igual porque lo
 * emite el sistema de liquidación.
 *
 * Cuando hay recibo, manda el recibo. Cuando no, se usa el nombre de la planilla EN MAYÚSCULA: no
 * se le da vuelta el orden, porque adivinar cuál de dos palabras es el apellido es exactamente el
 * error que este archivo existe para no cometer. Al menos la caja queda pareja y la lista se ordena
 * por la misma clave para todos.
 */
export const comoSeEscribe = (nombre) => String(nombre ?? '').toUpperCase().trim()

export const esSubcontratista = (nombreDelRecibo) =>
  Object.keys(SUBCONTRATISTAS_CON_LIQUIDACION).includes(String(nombreDelRecibo ?? '').trim())

/**
 * EL REPARTO 50/50 DE UNA LIQUIDACIÓN FINAL.
 *
 * El dueño lo pidió así: «el calculo de 50 en blanco (lo liquidado) y 50 en negro (lo q se paga en
 * efectivo)». O sea: lo que liquidó el estudio ES la mitad blanca, y la mitad negra es otro tanto
 * igual. El total que sale de la caja es el DOBLE del recibo — no la mitad, que es el error de
 * leerlo al revés.
 */
export function reparto50DeLiquidacionFinal(netoDelRecibo) {
  const n = Number(netoDelRecibo)
  if (!Number.isFinite(n) || n <= 0) return { blanco: null, negro: null, total: null }
  return { blanco: n, negro: n, total: n * 2 }
}
