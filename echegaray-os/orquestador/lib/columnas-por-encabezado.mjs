// LA LETRA DE UNA COLUMNA DE COMPRAS O COBRANZAS SALE DE SU RÓTULO. SIEMPRE. Un solo resolvedor.
//
// ═══ POR QUÉ (dueño, 14/09/2026) ═══
//
// La columna «Obra» se inserta en Compras L y Cobranzas H: todo lo que está a la derecha se corre una
// letra. El inventario de ese día encontró 146 archivos que nombran esas pestañas, 44 que ESCRIBEN
// con una letra que se corre y 15 que escriben FÓRMULAS con la letra adentro del texto. Google
// corrige las celdas al insertar; el generador, en su corrida siguiente, vuelve a escribir la letra
// vieja y el Cash Flow suma la columna de al lado sin dar un solo error.
//
// ═══ LAS TRES REGLAS ═══
//
//   1. Un rótulo que falta es un ERROR con su nombre adentro. Nunca una letra de respaldo: una letra
//      de respaldo es exactamente el defecto que este archivo viene a sacar, sólo que escondido.
//   2. Un rótulo repetido se pide por OCURRENCIA («Rubro de caja» 1.º = AB, 2.º = AC hoy). Pedirlo
//      como único cuando aparece dos veces es un error: elegir el primero es elegir a ciegas.
//   3. La fila de rótulos se lee UNA vez por corrida (`lectorDeEncabezados`): dos lecturas en la
//      misma corrida podrían ver dos layouts si alguien inserta en el medio.
//
// El guardián de regresión es `columnas-fijas.test.mjs`: da rojo si aparece un `Compras!<letra>`
// literal nuevo fuera de la lista de pendientes.

import { letra, normalizarRotulo } from './compras-columnas.mjs'

/** Dónde está la fila de rótulos y dónde arrancan los datos de cada pestaña. */
export const PESTANAS = Object.freeze({
  Compras: Object.freeze({ filaEncabezado: 3, primeraFila: 4 }),
  Cobranzas: Object.freeze({ filaEncabezado: 4, primeraFila: 5 }),
})

/** Los rótulos de Compras que usa el OS. Los repetidos, con su ocurrencia. */
export const COMPRAS = Object.freeze({
  id: 'ID', categoria: 'Categoría', fecha: 'Fecha factura', proveedor: 'Proveedor', tipo: 'Tipo',
  comprobante: 'N° Comprobante', unidad: 'Unidad de Negocio', cliente: 'Cliente / Asignación',
  detalle: 'Detalles / Obra', obra: Object.freeze({ rotulo: 'Obra', opcional: true }), concepto: 'Concepto',
  importe: 'Importe', iva: 'IVA', total: 'Total', tipoPago: 'Tipo pago', totalParcial: 'Total o Parcial',
  pagado: 'Monto Pagado', parcial1: 'Monto Parcial 1', fechaPrevista2: 'Fecha prevista de pago 2',
  parcial2: 'Monto Parcial 2', estado: 'Estado',
  rubroFosil: Object.freeze({ rotulo: 'Rubro de caja', ocurrencia: 1 }),
  rubro: Object.freeze({ rotulo: 'Rubro de caja', ocurrencia: 2 }),
  fechaCaja: 'Fecha de caja', familia: 'Familia de material', subRubro: 'Sub-rubro de estructura',
  comercial: '¿Proveedor comercial? (OS)', repetido: '¿Comprobante repetido? (OS)',
  saldo: 'Saldo pendiente (OS)', cuit: 'CUIT (OS)', tramo: 'Tramo de vencimiento (OS)',
})

/** Los rótulos de Cobranzas que usa el OS. */
export const COBRANZAS = Object.freeze({
  id: 'ID', cliente: 'Obra / Cliente', obra: Object.freeze({ rotulo: 'Obra', opcional: true }),
  oc: 'ORDEN DE COMPRA', concepto: 'Concepto', neto: 'Monto neto', total: 'TOTAL a cobrar (neto de retenciones)',
  formaCobro: 'Forma de Cobro', estado: 'Estado', fechaCobro: 'Fecha cobro',
  retIva: 'Retención 16,8% del neto ▲ rótulo original perdido', retGanancias: 'Ret Ganancias',
  retIibb: 'Retención 2,5%/3,5% del neto ▲ rótulo original perdido', moneda: 'Moneda',
})

const comoPedido = (p) => (typeof p === 'string'
  ? { rotulo: p, ocurrencia: null, opcional: false }
  : { rotulo: p.rotulo, ocurrencia: p.ocurrencia ?? null, opcional: p.opcional === true })

/**
 * Una columna por su rótulo: `{letra, indice}`. `null` sólo si se pidió `opcional` y no está.
 * @param {any[]} encabezado la fila de rótulos tal como se leyó
 * @param {string|{rotulo:string, ocurrencia?:number, opcional?:boolean}} pedido
 * @param {string} pestana para que el error diga dónde mirar
 */
export function ubicarColumna(encabezado = [], pedido, pestana = 'la pestaña') {
  const { rotulo, ocurrencia, opcional } = comoPedido(pedido)
  const clave = normalizarRotulo(rotulo)
  const hits = encabezado.flatMap((c, i) => (normalizarRotulo(c) === clave ? [i] : []))
  if (!hits.length) {
    if (opcional) return null
    throw new Error(`${pestana}: falta la columna «${rotulo}» en la fila de rótulos. No uso una letra de respaldo: arreglá el rótulo o el contrato.`)
  }
  if (ocurrencia === null && hits.length > 1) {
    throw new Error(`${pestana}: «${rotulo}» aparece ${hits.length} veces y se pidió como única — pedila por ocurrencia.`)
  }
  if (ocurrencia !== null && hits.length < ocurrencia) {
    throw new Error(`${pestana}: se pidió la ${ocurrencia}.ª «${rotulo}» y hay ${hits.length}.`)
  }
  const indice = hits[(ocurrencia ?? 1) - 1]
  return { letra: letra(indice), indice }
}

/** Varias columnas de una vez. Falla con TODOS los rótulos que faltan, no con el primero. */
export function columnasDe(encabezado, pedidas, pestana) {
  const out = {}
  const errores = []
  for (const [k, p] of Object.entries(pedidas)) {
    try { out[k] = ubicarColumna(encabezado, p, pestana) } catch (e) { errores.push(e.message) }
  }
  if (errores.length) throw new Error(errores.join('\n'))
  return out
}

const geo = (pestana) => {
  const g = PESTANAS[pestana]
  if (!g) throw new Error(`pestaña sin geometría declarada: ${pestana}`)
  return g
}

/** `Compras!$AD$4:$AD` — rango abierto de una columna resuelta. */
export function rangoAbierto(pestana, col) {
  return `${pestana}!$${col.letra}$${geo(pestana).primeraFila}:$${col.letra}`
}

/** `Cobranzas!$N$5:$N$400` — rango cerrado (sólo donde el archivo ya lo tenía cerrado). */
export function rangoHasta(pestana, col, hasta) {
  return `${pestana}!$${col.letra}$${geo(pestana).primeraFila}:$${col.letra}$${hasta}`
}

/** Filas enteras (A…BZ) desde `desde` hasta `hasta` (abierto si no se da). Se indexan después por columna resuelta. */
export function rangoFilas(pestana, desde, hasta = '') {
  return `${pestana}!A${desde}:BZ${hasta}`
}

/** Una columna resuelta, desde `desde` hacia abajo. */
export function rangoColumna(pestana, letraColumna, desde = 1) {
  return `${pestana}!${letraColumna}${desde}:${letraColumna}`
}

/** El rango de la fila de rótulos, para leerla. */
export function rangoEncabezado(pestana) {
  const f = geo(pestana).filaEncabezado
  return `${pestana}!A${f}:BZ${f}`
}

/**
 * La fila de rótulos leída UNA vez por corrida, y las columnas resueltas contra ella.
 * @param {{readSheetValues:Function}} google
 */
export function lectorDeEncabezados(google, fileId) {
  const cache = new Map()
  const encabezado = (pestana) => {
    if (!cache.has(pestana)) {
      cache.set(pestana, google.readSheetValues(fileId, rangoEncabezado(pestana)).then((r) => r?.[0] ?? []))
    }
    return cache.get(pestana)
  }
  const columnas = async (pestana, pedidas = pestana === 'Compras' ? COMPRAS : COBRANZAS) =>
    columnasDe(await encabezado(pestana), pedidas, pestana)
  return { encabezado, columnas }
}
