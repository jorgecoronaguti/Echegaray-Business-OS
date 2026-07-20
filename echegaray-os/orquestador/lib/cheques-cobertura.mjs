// ¿LOS CHEQUES Y LA TARJETA ESTÁN CONTEMPLADOS EN EL CASH FLOW, O SON PLATA INVISIBLE?
//
// LA PREGUNTA DEL DUEÑO (20/07): "¿qué pasó con los cheques a cubrir en los cash flows, en qué
// concepto están?" y "¿todo lo que se contempla en Compras está en algún concepto del cash flow?".
//
// MI RESPUESTA ANTERIOR ESTABA MAL A MEDIAS. Excluí los cheques del cash flow diciendo "el cheque es
// CÓMO se paga, no qué se compró". Eso es cierto — pero SÓLO si la factura que el cheque paga está
// cargada en Compras. Al medirlo:
//
//   CHEQUES   89 filas · $71.900.300
//     · 39 ($38.388.505) tienen su factura en Compras → ya están en el cash flow, en el rubro que le
//       toque a esa factura. Sumarlos otra vez duplicaría.
//     · 50 ($33.511.796) NO tienen factura en Compras → son pagos reales que el cash flow NO ve.
//   TARJETA   29 filas · $8.785.691
//     · 24 ($7.437.350) están en Compras · 5 ($1.348.341) no.
//
// O sea: la respuesta correcta no es "sumarlos" ni "ignorarlos". Es medir cuánto de cada uno ya está
// contemplado, y mostrar el resto como trabajo pendiente de carga. Un cheque sin factura en Compras
// no es un problema del cash flow: es una compra que nadie registró.
//
// LA LLAVE ES EL NÚMERO DE COMPROBANTE, no el monto. Cruzar por proveedor+monto daba sólo 2 matches
// de 89 — porque un cheque suele pagar una parte de una factura, o varias facturas juntas. Por
// comprobante dan 39. El número de comprobante es el único identificador que comparten las dos
// planillas.

/**
 * Normaliza un número de comprobante para poder cruzarlo entre planillas.
 * "0001-000036", "1-36" y "00001-0000036" son el MISMO comprobante: punto de venta 1, número 36.
 * Por eso se limpia cada parte por separado — sacar los ceros de la cadena entera daba "1000036"
 * contra "10000036" y el match fallaba justo en los comprobantes con más relleno.
 */
export const normComprobante = (s) => String(s ?? '')
  .split(/[^0-9]+/)
  .filter(Boolean)
  .map((p) => p.replace(/^0+/, '') || '0')
  .join('-')

/**
 * ¿Esta clave sirve para cruzar, o es demasiado pobre y va a dar matches falsos?
 *
 * Sirve si tiene DOS partes (punto de venta + número, el formato de una factura argentina) o si es
 * un número largo. Contar sólo dígitos era el criterio equivocado: la factura "00045-00000009" se
 * normaliza a "45-9" — tres dígitos — y quedaba descartada, con lo cual las 12 cuotas de la tarjeta
 * de Modica figuraban como "sin factura en Compras" cuando la factura estaba ahí.
 */
export const esLlaveUtil = (k) => k.includes('-') || k.replace(/-/g, '').length >= 5

/**
 * NÚCLEO PURO: reparte instrumentos de pago (cheques, tarjeta) entre los que YA están contemplados
 * en Compras y los que no.
 * @param {Array<{comprobante?:string, monto:number, proveedor?:string, fecha_pago?:string, debitado?:string}>} instrumentos
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @returns {{contemplados:Array, sin_registrar:Array, total:number, monto_contemplado:number, monto_sin_registrar:number, sin_numero:number}}
 */
export function repartirCobertura(instrumentos = [], comprobantesEnCompras = new Set()) {
  const contemplados = []
  const sinRegistrar = []
  let sinNumero = 0
  for (const i of instrumentos) {
    const k = normComprobante(i.comprobante)
    if (!esLlaveUtil(k)) sinNumero++
    if (esLlaveUtil(k) && comprobantesEnCompras.has(k)) contemplados.push(i)
    else sinRegistrar.push(i)
  }
  const suma = (a) => a.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  return {
    contemplados,
    sin_registrar: sinRegistrar,
    total: suma(instrumentos),
    monto_contemplado: suma(contemplados),
    monto_sin_registrar: suma(sinRegistrar),
    sin_numero: sinNumero,
  }
}

/**
 * NÚCLEO PURO: los cheques que todavía hay que CUBRIR, agrupados por mes de pago.
 * Es una pregunta de tesorería distinta de la anterior: no importa si la factura está registrada,
 * importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido y no debitado es un
 * compromiso en firme — más firme que una factura con fecha prevista.
 * @param {Array} instrumentos con {monto, fecha_pago:'YYYY-MM', debitado}
 * @returns {{por_mes:Array<{mes:string, cantidad:number, monto:number}>, total:number}}
 */
export function aCubrirPorMes(instrumentos = []) {
  const acc = new Map()
  let total = 0
  for (const i of instrumentos) {
    // "DEBITADO = SI" ya salió de la cuenta. Lo demás está pendiente de cubrir.
    if (String(i.debitado ?? '').trim().toUpperCase() === 'SI') continue
    const mes = String(i.fecha_pago ?? '').trim() || '(sin fecha)'
    const m = Number(i.monto) || 0
    total += m
    const a = acc.get(mes) ?? { mes, cantidad: 0, monto: 0 }
    a.cantidad++; a.monto += m
    acc.set(mes, a)
  }
  return { por_mes: [...acc.values()].sort((a, b) => a.mes.localeCompare(b.mes)), total }
}
