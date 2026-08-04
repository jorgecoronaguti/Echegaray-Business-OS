/**
 * UNA SOLA DEFINICIÓN DE "QUÉ SALE DE LA CAJA Y CUÁNDO", PARA LOS DOS CUADROS.
 *
 * ═══ POR QUÉ EXISTE (04/08/2026) ═══
 *
 * El dueño: "caja no me da seguridad". Tenía razón, y el número lo probaba: al 04/08 el calendario
 * de vencimientos de CAJA decía que a fin de agosto quedaban $237.288.082 y el Cash Flow Mensual
 * decía $195.583.731 para el MISMO mes, arrancando del MISMO saldo ($115.548.303). $41.704.351 de
 * desacuerdo entre dos vistas de la misma plata hace inservibles a las dos.
 *
 * LA HIPÓTESIS QUE SE VERIFICÓ Y ERA FALSA: "el calendario no incluye la nómina". Sí la incluye —
 * lee JORNALES_REAL_*, JORNALES_PROY_* y OFICINA_* desde el 31/07— y su línea de control en cero
 * lo estaba diciendo: ese control mide `sale − cheques − nómina`, así que CERO significa "la nómina
 * está adentro y cuadra", no "no hay nómina". Se leyó como si faltara.
 *
 * LA CAUSA REAL ES PEOR, PORQUE NO SE VE: los dos cuadros clasifican por EJES DISTINTOS.
 *
 *   · El calendario clasifica por INSTRUMENTO: suma el cheque que ya se libró y tiene fecha de pago,
 *     más la nómina. Todo lo que se va a pagar por transferencia o débito automático y todavía no
 *     tiene un cheque firmado es INVISIBLE para él.
 *   · El cash flow clasifica por RUBRO: proveedores, estructura, impuestos, cargas sociales,
 *     gremiales, plan previsional, servicio de deuda — de Compras, con proyección por ritmo.
 *
 * Un eje no es más correcto que el otro; tener DOS es lo que está mal. Y el error no es simétrico:
 * el calendario, que es el que produce el PISO PROYECTADO DE CAJA, es el que ve de MENOS. Un piso
 * más alto que el real es el error que peor se paga — se coloca plata a 30 días y no se llega a
 * pagar los sueldos.
 *
 * MEDIDO al 04/08, agosto, lo que el calendario no veía: $9.000.000 de retiros de Dirección con
 * fecha 10/08 (lee OFICINA_* pero no DIRECCION_*, y son las dos mitades de la misma línea de
 * nómina), $8.000.000 de cargas sociales F931, $2.968.643 del plan de pago previsional, $1.530.185
 * de gremiales, $2.850.628 de servicio de deuda y $996.163 de estructura.
 *
 * ═══ QUÉ HACE ESTE ARCHIVO ═══
 *
 * No define nada nuevo: TOMA la definición que ya existe —el CUADRO del cash flow y su
 * `expresionReal(línea, desde, hasta)`— y la expone por VENTANA DE FECHAS en vez de por mes. El
 * calendario de CAJA pasa a ser el mismo universo de plata, cortado en tramos en vez de en meses.
 * Por construcción los dos cuadros ya no pueden discrepar en QUÉ cuentan; sólo en CUÁNDO, que es
 * exactamente la pregunta que el calendario existe para contestar.
 *
 * LA PROPIEDAD QUE LO SOSTIENE, Y ES LA QUE HAY QUE NO ROMPER: una línea del cash flow que este
 * archivo no sepa resolver NO se descarta en silencio. Rompe. Ese es el defecto que costó los
 * $41,7M: no fue una fórmula mal escrita, fue un concepto que nadie sumó y nada avisó.
 */

import { CUADRO, expresionReal } from './cash-flow-lineas.mjs'

/**
 * Las líneas del CUADRO que mueven plata de verdad, con su signo.
 *
 * SE EXCLUYEN LOS GRUPOS CON SIGNO 0 Y NO ES UN DETALLE: son memos —la misma nómina leída de
 * Compras, lo que salió del banco sin factura— que existen para que una brecha se vea. Sumarlos al
 * calendario contaría dos veces la misma plata, que es el error que este archivo vino a matar.
 * @returns {Array<{linea:object, signo:number, actividad:string, grupo:string}>}
 */
export function lineasDeCaja() {
  return CUADRO.flatMap((a) =>
    a.grupos
      .filter((g) => g.signo !== 0)
      .flatMap((g) => g.lineas.map((linea) => ({ linea, signo: g.signo, actividad: a.actividad, grupo: g.nombre }))))
}

/**
 * Las líneas que `expresionReal` no sabe resolver sola y necesitan un resolutor del generador.
 *
 * Son las cinco de siempre y cada una por una razón distinta: los cheques y la tarjeta cruzan por
 * número de comprobante (se llenan con valores), el IVA/IIBB sale del calendario fiscal, el interés
 * del descubierto de una tasa sobre el saldo, las comisiones del extracto, y el impuesto al cheque
 * del total de las demás líneas. Ninguna vive en Compras.
 * @returns {Array<string>} el nombre de cada una
 */
export function lineasQueNecesitanResolutor() {
  return lineasDeCaja()
    .filter(({ linea }) => expresionReal(linea, 'X', 'Y') === null)
    .map(({ linea }) => linea.nombre)
}

/** La marca de una línea, para que el resolutor sepa cuál le toca sin comparar rótulos. */
export function marcaDeLinea(l) {
  if (l.cheques) return `cheques:${l.inst}`
  if (l.calendarioImpuestos) return 'impuestos'
  if (l.descubierto) return 'descubierto'
  if (l.comisionesBancarias) return 'comisiones'
  if (l.impuestoCheque) return 'impuestoCheque'
  return null
}

/**
 * NÚCLEO PURO: los sumandos de un lado de la caja en una ventana de fechas.
 *
 * @param {number} signo 1 (entra) o -1 (sale)
 * @param {string} desde expresión de inicio · @param {string} hasta límite EXCLUYENTE
 * @param {object} resolutor mapa marca → (desde, hasta) => string. Lo que este archivo no sabe.
 * @returns {Array<{nombre:string, expresion:string}>}
 */
export function sumandosEnVentana(signo, desde, hasta, resolutor = {}) {
  const faltan = []
  const sumandos = []
  for (const { linea, signo: s } of lineasDeCaja()) {
    if (s !== signo) continue
    const propia = expresionReal(linea, desde, hasta)
    if (propia) { sumandos.push({ nombre: linea.nombre, expresion: propia }); continue }
    const marca = marcaDeLinea(linea)
    const fn = marca && resolutor[marca]
    // FALLA CERRADO. Una línea sin expresión y sin resolutor es plata que el calendario dejaría de
    // ver — que es literalmente el defecto de $41,7M. Antes de descartarla en silencio, rompe.
    if (typeof fn !== 'function') { faltan.push(`${linea.nombre} (marca: ${marca ?? 'ninguna'})`); continue }
    sumandos.push({ nombre: linea.nombre, expresion: fn(desde, hasta) })
  }
  if (faltan.length) {
    throw new Error(
      `calendario-egresos: ${faltan.length} línea(s) del cash flow sin forma de calcularse en una ventana, `
      + `y el calendario las estaría ignorando en silencio: ${faltan.join(' · ')}`)
  }
  return sumandos
}

/**
 * NÚCLEO PURO: la fórmula es-AR de lo que SALE de la caja en una ventana. Misma definición que el
 * cash flow, otra ventana.
 */
export function expresionSaleEnVentana(desde, hasta, resolutor = {}) {
  return sumandosEnVentana(-1, desde, hasta, resolutor).map((s) => s.expresion).join('+')
}

/** NÚCLEO PURO: ídem para lo que ENTRA. */
export function expresionEntraEnVentana(desde, hasta, resolutor = {}) {
  return sumandosEnVentana(1, desde, hasta, resolutor).map((s) => s.expresion).join('+')
}

/**
 * AUDITORÍA PURA: qué conceptos de caja NO estaría viendo un calendario que sólo mira estas fuentes.
 *
 * Es el control que faltaba. El que había —"cheques no debitados + nómina de obra sin pagar +
 * oficina"— se validaba contra las MISMAS tres fuentes que el calendario suma: por construcción
 * daba cero, y dar cero se leía como "está todo". Un control no puede medirse contra la fuente que
 * produce el número que controla. Éste mide contra el cuadro contable completo, que es otra cosa.
 *
 * @param {Array<string>} fuentes los nombres de línea que el calendario sí suma
 * @returns {Array<string>} los que quedan afuera
 */
export function conceptosFueraDelCalendario(fuentes) {
  const vistos = new Set(fuentes)
  return lineasDeCaja().filter(({ signo }) => signo === -1).map(({ linea }) => linea.nombre).filter((n) => !vistos.has(n))
}
