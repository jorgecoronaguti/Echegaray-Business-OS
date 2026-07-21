// LAS RETENCIONES QUE LE HACEN A LA EMPRESA — plata ya pagada que el OS no estaba computando.
//
// POR QUÉ EXISTE (21/07). El dueño: "pestaña impuestos y financieros tiene que ser súper certera,
// hay datos que no sé si están conectados de este sheet y cruzados en ARCA, hay retenciones que
// considerar. Revisión absoluta."
//
// Tenía razón y el hueco es de plata. Cobranzas registra tres columnas de retenciones sufridas
// (X, Y, Z) por $7.388.784, y la pestaña de Impuestos no las mira en ningún lado. Una retención NO
// es un descuento: es impuesto YA PAGADO por adelantado, que se computa como pago a cuenta. Sin
// ellas, el "A PAGAR" del cuadro está inflado y el cash flow proyecta una salida que no va a
// ocurrir entera.
//
// ═══ QUÉ IMPUESTO ES CADA UNA: MEDIDO, NO SUPUESTO ═══
//
// Los rótulos de las columnas X y Z estaban marcados como reconstruidos (se habían perdido), así
// que no se puede confiar en lo que dicen. La alícuota se calcula del dato, fila por fila, y las
// nueve coinciden exacto:
//
//   X = 80,00% del IVA facturado (= 16,80% del neto)  → RETENCIÓN DE IVA
//   Y =  2,00% del neto                                → RETENCIÓN DE GANANCIAS
//   Z =  2,50% del neto (una al 3,50%)                 → RETENCIÓN DE INGRESOS BRUTOS
//
// La consistencia es la prueba: nueve filas de un mismo cliente dando el mismo porcentaje al
// segundo decimal no es casualidad, es un régimen de retención. Por eso `clasificar()` VERIFICA la
// alícuota de cada fila y marca la que no encaja en vez de imputarla igual — una retención puesta
// en el impuesto equivocado es un crédito fiscal que no existe.
//
// ═══ LO QUE NO HACE ═══
//
// No decide en qué mes se computa. Una retención se imputa al período de la retención, que es la
// FECHA DE COBRO, y eso lo resuelve quien llama con la columna que corresponda. Tampoco toca IIBB:
// las retenciones de Ingresos Brutos YA vienen declaradas en la DDJJ de Rentas que la pestaña lee
// ($2.299.780 en ene-jun contra $888.550 de la columna Z), así que sumarlas otra vez sería contar
// dos veces lo mismo — el caso clásico que la regla de oro de no duplicar previene.

/** Los regímenes que se reconocen, con la alícuota medida en los datos reales. */
export const REGIMENES = {
  iva: { nombre: 'IVA', base: 'iva', alicuota: 0.80, tolerancia: 0.005 },
  ganancias: { nombre: 'Ganancias', base: 'neto', alicuota: 0.02, tolerancia: 0.005 },
  // IIBB admite dos alícuotas según el régimen del cliente; se aceptan las dos.
  iibb: { nombre: 'Ingresos Brutos', base: 'neto', alicuotas: [0.025, 0.035], tolerancia: 0.003 },
}

/** De qué columna de Cobranzas sale cada régimen (0-indexada). */
export const COLUMNAS = { iva: 23, ganancias: 24, iibb: 25 }

/** Los impuestos cuyo crédito el OS computa. IIBB queda afuera: ya viene en la DDJJ de Rentas. */
export const COMPUTA = ['iva', 'ganancias']

/**
 * NÚCLEO PURO: ¿la retención encaja con la alícuota de su régimen?
 * @returns {{ok:boolean, alicuota:number|null}}
 */
export function verificarAlicuota(regimen, monto, neto, iva) {
  const r = REGIMENES[regimen]
  if (!r) return { ok: false, alicuota: null }
  const base = r.base === 'iva' ? Number(iva) : Number(neto)
  if (!(base > 0) || !(Number(monto) > 0)) return { ok: false, alicuota: null }
  const a = Number(monto) / base
  const esperadas = r.alicuotas ?? [r.alicuota]
  return { ok: esperadas.some((e) => Math.abs(a - e) <= r.tolerancia), alicuota: a }
}

/**
 * NÚCLEO PURO: clasifica las retenciones de una lista de cobros.
 *
 * @param {Array<{fila:number, cliente:string, mes:string, neto:number, iva:number, retenciones:{iva:number,ganancias:number,iibb:number}}>} cobros
 * @returns {{porRegimen:Object, porMes:Object, sospechosas:Array, total:number}}
 */
export function clasificar(cobros = []) {
  const porRegimen = {}
  const porMes = {}
  const sospechosas = []
  let total = 0

  for (const c of cobros) {
    for (const reg of Object.keys(REGIMENES)) {
      const monto = Number(c.retenciones?.[reg]) || 0
      if (!(monto > 0)) continue
      const v = verificarAlicuota(reg, monto, c.neto, c.iva)
      total += monto
      // UNA ALÍCUOTA QUE NO ENCAJA NO SE IMPUTA IGUAL. Puede ser otro impuesto, otro régimen o un
      // error de carga; en cualquiera de los tres casos meterla como crédito fiscal inventa plata.
      if (!v.ok) { sospechosas.push({ ...c, regimen: reg, monto, alicuota: v.alicuota }); continue }
      porRegimen[reg] = (porRegimen[reg] ?? 0) + monto
      const k = `${reg}|${c.mes}`
      porMes[k] = (porMes[k] ?? 0) + monto
    }
  }
  return { porRegimen, porMes, sospechosas, total }
}

/** NÚCLEO PURO: lo computable como pago a cuenta de un impuesto en un mes. */
export function creditoDelMes(clasificado, regimen, mes) {
  return clasificado?.porMes?.[`${regimen}|${mes}`] ?? 0
}

/** 'YYYY-MM' de una fecha en cualquiera de los formatos del Sheet. Misma regla que el resto del OS. */
export function mes(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString().slice(0, 7)
  const s = String(v ?? '').trim()
  if (!s) return ''
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s)
  if (m) {
    const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    return `${a}-${String(m[2]).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  return ''
}
