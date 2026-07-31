// CUÁNDO SE EFECTIVIZA EL PAGO DE UNA OBLIGACIÓN — Y CÓMO SE DESCARGA.
//
// ═══ EL PEDIDO, TEXTUAL (31/07) ═══
//
// "necesito q resuelvas lo q te pedi de lo q se paga en jornales por quincena, cargas sociales,
//  impuestos, cdo se efectiviza el pago, necesito marcarlo y q haga las descargas correspondientes"
//
// Y antes: "jornales por quincena merece revision profunda porque hay cosas desconectadas y mal".
//
// ═══ LAS TRES DESCONEXIONES QUE APARECIERON AL MIRARLO ═══
//
// 1. EL TITULAR DECIDÍA POR LA FECHA DE CIERRE, NO POR LA DE PAGO. "Obra — quincenas cerradas, ya
//    pagadas" sumaba las quincenas con `Hasta <= HOY`. La quincena que cerró el 31/07 se paga el
//    03/08: el titular la contaba como PAGADA con la plata todavía en la cuenta. $7.675.588 dados por
//    salidos. La columna "Se paga el" existía y nadie la usaba dentro de su propia pestaña.
//
// 2. LA PLANILLA Y EL BANCO NO SE COMPARABAN NUNCA. La columna "Banco" del registro sale de la
//    planilla JORNALES —lo que alguien tipeó—, y el extracto tiene los lotes reales de "Pago haberes".
//    Medido: la quincena que cerró el 30/06 dice "Banco: —" y el extracto muestra $3.745.312 el
//    01/07, que es exactamente su fecha de pago. La del 15/07 dice $4.028.550 contra $3.775.150 del
//    banco. Ningún control mira esa diferencia, así que $3,8M de discrepancia vivían invisibles.
//
// 3. NO HABÍA FORMA DE DECIR "ESTO YA SE PAGÓ". El estado se infería de la fecha de cierre, así que
//    una quincena cerrada figuraba pagada aunque la plata no hubiera salido, y una pagada antes de lo
//    previsto no tenía dónde registrarse.
//
// ═══ EL MODELO ═══
//
// Una obligación tiene TRES fechas y no hay que confundirlas nunca:
//
//   CIERRE   — cuándo terminó el período que se debe (la quincena, el mes de cargas, el período fiscal)
//   PREVISTA — cuándo se estima que se paga (el lote del banco si ya pasó; si no, el parámetro)
//   PAGADA   — cuándo salió la plata DE VERDAD. Es la única que descarga la obligación.
//
// El estado sale de las tres, y la plata se imputa a la fecha PAGADA si existe, a la PREVISTA si no.
// Esa es "la descarga": mientras no haya fecha de pago real, la obligación pesa en el calendario de
// CAJA; cuando la hay, deja de pesar y la salida ya está en el extracto.
//
// ═══ LA REGLA QUE EVITA CONTAR DOS VECES ═══
//
// Antes del corte del extracto MANDA EL BANCO: la salida ya está en los movimientos, así que la
// obligación no debe volver a sumarse. Después del corte manda la obligación, que es la proyección.
// Es la misma asimetría que CAJA ya aplica a Compras y Cobranzas con "movimientos posteriores al
// corte". Sin ella, un jornal pagado el 17/07 se contaría en el extracto Y en el calendario.

/** Los tres estados posibles. Un cuarto ("vencida") no existe: es "a pagar" con fecha pasada. */
export const ESTADOS = { EN_CURSO: 'en curso', A_PAGAR: 'a pagar', PAGADA: 'pagada' }

export const aFecha = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  return null
}
const dia = (d) => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null)

/**
 * NÚCLEO PURO: el estado de una obligación y la fecha con la que su plata se imputa.
 *
 * @param {{cierre?:any, prevista?:any, pagada?:any, hoy?:Date}} o
 * @returns {{estado:string, fechaDeCaja:Date|null, pagada:boolean, diasDeAtraso:number|null}}
 */
export function estadoObligacion({ cierre, prevista, pagada, hoy = new Date() } = {}) {
  const c = dia(aFecha(cierre)); const p = dia(aFecha(prevista)); const real = dia(aFecha(pagada))
  const h = dia(hoy)
  // PAGADA gana sobre todo: es un hecho, no una estimación.
  if (real) return { estado: ESTADOS.PAGADA, fechaDeCaja: real, pagada: true, diasDeAtraso: null }
  // Sin cierre no hay obligación todavía.
  if (!c) return { estado: ESTADOS.EN_CURSO, fechaDeCaja: null, pagada: false, diasDeAtraso: null }
  if (c > h) return { estado: ESTADOS.EN_CURSO, fechaDeCaja: p ?? null, pagada: false, diasDeAtraso: null }
  // Cerrada y sin pago registrado: se DEBE. El atraso se cuenta desde la fecha prevista.
  const atraso = p && p < h ? Math.round((h - p) / 86400000) : 0
  return { estado: ESTADOS.A_PAGAR, fechaDeCaja: p ?? c, pagada: false, diasDeAtraso: atraso }
}

/**
 * NÚCLEO PURO: el lote del banco que corresponde a una fecha de pago, con tolerancia en días.
 *
 * Un lote es la suma de los movimientos de haberes de un mismo día: quince transferencias del 17/07
 * son UN pago. Se busca el lote más cercano a la fecha prevista dentro de la tolerancia.
 *
 * @param {any} fecha la fecha prevista o real del pago
 * @param {Array<{fecha:any, total:number}>} lotes
 * @param {number} tolerancia días a cada lado
 */
export function loteDeLaFecha(fecha, lotes = [], tolerancia = 3) {
  const f = dia(aFecha(fecha))
  if (!f) return null
  let mejor = null
  for (const l of lotes) {
    const lf = dia(aFecha(l.fecha))
    if (!lf) continue
    const d = Math.abs(Math.round((lf - f) / 86400000))
    if (d <= tolerancia && (!mejor || d < mejor.dist)) mejor = { ...l, fecha: lf, dist: d }
  }
  return mejor
}

/**
 * NÚCLEO PURO: la conciliación de UNA quincena contra el banco.
 *
 * @param {{banco:number, lote:{total:number}|null, total:number}} q
 * @returns {{diferencia:number, veredicto:string}}
 */
export function conciliarConBanco({ banco = 0, lote = null, total = 0 } = {}) {
  const enBanco = Number(lote?.total ?? 0)
  const dice = Number(banco ?? 0)
  const dif = Math.round((enBanco - dice) * 100) / 100
  if (!lote) {
    // Sin lote no se puede afirmar nada: puede estar fuera de la ventana del extracto.
    return { diferencia: 0, veredicto: 'sin extracto para esa fecha' }
  }
  if (Math.abs(dif) < 1) return { diferencia: 0, veredicto: '✓ la planilla y el banco coinciden' }
  if (dice === 0) return { diferencia: dif, veredicto: `⚠ el banco pagó ${fmt(enBanco)} y la planilla no registra nada por banco` }
  return { diferencia: dif, veredicto: `⚠ el banco muestra ${fmt(enBanco)} y la planilla ${fmt(dice)}` }
}

const fmt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * ¿Esta obligación tiene que pesar en el calendario de CAJA?
 *
 * NO si su plata ya está en el extracto (pagada en o antes del corte): sumarla sería contar dos veces.
 * SÍ si todavía se debe, o si se pagó DESPUÉS del corte (el extracto no la tiene).
 */
export function pesaEnElCalendario({ estado, fechaDeCaja, corteExtracto } = {}) {
  const corte = dia(aFecha(corteExtracto))
  const f = dia(aFecha(fechaDeCaja))
  if (estado === ESTADOS.EN_CURSO) return false          // todavía no se debe
  if (estado === ESTADOS.A_PAGAR) return true            // se debe: pesa
  if (!corte || !f) return false                        // pagada sin corte conocido: el extracto la tiene
  return f > corte                                      // pagada DESPUÉS del corte: el extracto no la vio
}
