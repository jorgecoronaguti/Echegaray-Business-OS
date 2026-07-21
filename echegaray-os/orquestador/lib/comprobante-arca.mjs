// EL SIGNO DE UN COMPROBANTE — una nota de crédito RESTA.
//
// ═══ POR QUÉ EXISTE (21/07), Y CUÁNTO COSTABA NO TENERLO ═══
//
// El OS replica los libros de IVA de ARCA en `comprobantes_arca` y todo lo que los consume sumaba
// `imp_total` y `total_iva` sin mirar `tipo_comprobante`. En el libro de COMPRAS había 13 notas de
// crédito por $20.976.638: el OS las contaba como si fueran compras más.
//
// El error no es de $20,9M sino del DOBLE, $41.953.276, porque cada nota entra mal dos veces: se
// suma cuando debía restarse. Compras declaradas $197.442.458 contra $155.489.182 reales.
//
// Y lo caro no es el cuadro de compras, es el IVA. Una nota de crédito de compra reduce el CRÉDITO
// FISCAL; sumarla lo infla, y un crédito fiscal inflado hace que el OS declare menos IVA del que
// hay que pagar. Medido contra los datos reales: **$7.231.456** de posición de IVA sin declarar en
// siete meses, y mayo dando vuelta de $4.017.601 a favor a $2.610.762 a pagar. Eso no es un cuadro
// que queda feo: es un riesgo fiscal.
//
// ═══ CÓMO SE DESCUBRIÓ, QUE IMPORTA MÁS QUE EL BUG ═══
//
// Buscando qué facturas de ARCA faltaban en Compras aparecieron PARES: mismo proveedor, mismo día,
// importes casi idénticos (ACEROLATINA a $3 de diferencia, FRIOLATINA a $14). Parecía facturación
// duplicada. Mirando el CAE eran comprobantes distintos y legítimos; mirando `tipo_comprobante`,
// uno era tipo 1 (Factura A) y el otro tipo 3 (Nota de Crédito A). Nunca hubo duplicado: había una
// columna que nadie leía.
//
// ═══ LA DECISIÓN DE DISEÑO: UN TIPO DESCONOCIDO NO SE ADIVINA ═══
//
// La tabla de abajo cubre los códigos de ARCA que aparecen en los libros de una constructora. Un
// código que no está NO se asume positivo: `signo()` devuelve null y el que llama tiene que
// decidir qué hacer, normalmente avisar. Asumir +1 es exactamente el error que causó todo esto —
// tratar lo que no se conoce como si fuera lo habitual.

/** Códigos de ARCA que RESTAN: notas de crédito en todas sus variantes. */
export const NOTAS_DE_CREDITO = new Set([
  '3',    // Nota de Crédito A
  '8',    // Nota de Crédito B
  '13',   // Nota de Crédito C
  '21',   // Nota de Crédito E (exportación)
  '41',   // Nota de Crédito T
  '53',   // Nota de Crédito M
  '110',  // Tique Nota de Crédito
  '112',  // Tique Nota de Crédito A
  '113',  // Tique Nota de Crédito B
  '114',  // Tique Nota de Crédito C
  '119',  // Tique Nota de Crédito M
  '203',  // Nota de Crédito Factura de Crédito Electrónica MiPyME A
  '208',  // Nota de Crédito FCE MiPyME B
  '213',  // Nota de Crédito FCE MiPyME C
])

/** Códigos que SUMAN: facturas, tiques, notas de débito y comprobantes de crédito electrónico. */
export const SUMAN = new Set([
  '1', '2', '6', '7', '11', '12', '19', '20', '39', '40', '51', '52',
  '81', '82', '83', '109', '111', '118',
  '201', '202', '206', '207', '211', '212',
])

/** Nombre legible, para que un cuadro pueda decir qué es cada cosa. */
export const NOMBRE = {
  1: 'Factura A', 2: 'Nota de Débito A', 3: 'Nota de Crédito A',
  6: 'Factura B', 7: 'Nota de Débito B', 8: 'Nota de Crédito B',
  11: 'Factura C', 12: 'Nota de Débito C', 13: 'Nota de Crédito C',
  51: 'Factura M', 52: 'Nota de Débito M', 53: 'Nota de Crédito M',
  81: 'Tique Factura A', 82: 'Tique Factura B', 83: 'Tique',
  109: 'Tique C', 111: 'Tique Factura C', 112: 'Tique Nota de Crédito A',
  113: 'Tique Nota de Crédito B', 114: 'Tique Nota de Crédito C',
  201: 'Factura de Crédito Electrónica MiPyME A', 202: 'Nota de Débito FCE MiPyME A',
  203: 'Nota de Crédito FCE MiPyME A',
}

/**
 * NÚCLEO PURO: +1 si el comprobante suma, −1 si resta, null si el código no se conoce.
 *
 * DEVUELVE null A PROPÓSITO. Un tipo desconocido tratado como +1 es el bug que originó este
 * archivo. Quien llama decide: avisar, excluir, o preguntar — pero no adivinar en silencio.
 */
export function signo(tipoComprobante) {
  const t = String(tipoComprobante ?? '').trim()
  if (!t) return null
  if (NOTAS_DE_CREDITO.has(t)) return -1
  if (SUMAN.has(t)) return 1
  return null
}

/** ¿Es una nota de crédito? */
export function esNotaDeCredito(tipoComprobante) {
  return signo(tipoComprobante) === -1
}

/** Nombre legible del tipo; si no se conoce, lo dice en vez de inventarlo. */
export function nombreTipo(tipoComprobante) {
  const t = Number(tipoComprobante)
  return NOMBRE[t] ?? `tipo ${tipoComprobante} (desconocido)`
}

/**
 * NÚCLEO PURO: suma una lista de comprobantes respetando el signo.
 * @param {Array<{tipo_comprobante:string|number}>} comprobantes
 * @param {string} campo cuál importe sumar ('imp_total', 'total_iva', 'neto_gravado'…)
 * @returns {{neto:number, suman:number, restan:number, desconocidos:Array}}
 */
export function sumar(comprobantes = [], campo = 'imp_total') {
  let suman = 0, restan = 0
  const desconocidos = []
  for (const c of comprobantes) {
    const s = signo(c?.tipo_comprobante)
    const v = Number(c?.[campo]) || 0
    // Un comprobante de tipo desconocido NO se suma ni se resta: se aparta y se informa. Meterlo
    // con signo supuesto es cambiar un número que alguien va a usar para pagar impuestos.
    if (s === null) { desconocidos.push(c); continue }
    if (s > 0) suman += v; else restan += v
  }
  return { neto: suman - restan, suman, restan, desconocidos }
}

/**
 * El fragmento SQL que aplica el signo. Existe para que la base y el JS no tengan dos versiones de
 * la misma regla — que es justo lo que la regla de oro prohíbe.
 * @param {string} col la columna a sumar
 * @returns {string} SQL
 */
export function sqlConSigno(col = 'imp_total') {
  return `sum(case when ${sqlEsNotaDeCredito()} then -${col} else ${col} end)`
}

/**
 * El predicado SQL "esto es una nota de crédito". Se expone aparte para que nadie tenga que volver
 * a tipear la lista de códigos en un `filter` o un `where` — la lista vive en un solo lugar.
 * @returns {string} SQL
 */
export function sqlEsNotaDeCredito(col = 'tipo_comprobante') {
  return `${col} in (${[...NOTAS_DE_CREDITO].map((t) => `'${t}'`).join(', ')})`
}
