// LO QUE LE FALTA AL CRUCE DE CHEQUES PARA CERRAR — NÚCLEO PURO, SIN RED NI BASE.
//
// ═══ POR QUÉ EXISTE (04/09/2026) ═══
//
// El dueño: «no estás cruzando correctamente los cheques emitidos con lo que marca de pendiente a
// deuda en algunos proveedores». Medido sobre el archivo vivo: 114 cheques, 33 sin número de
// comprobante por $35.557.064, y 8 proveedores con cheque emitido que NO tienen una sola fila en
// Compras por $13.173.792.
//
// `cheques-cobertura.mjs` ya cruza por número de comprobante e infiere por (proveedor, importe,
// fecha) cuando el número falta. Esto NO lo reemplaza: mira lo que queda AFUERA de ese cruce y lo
// convierte en trabajo concreto, porque el dato que falta lo tiene una persona, no el algoritmo.
//
// ═══ EL CASO QUE LO ORIGINÓ, Y POR QUÉ NO LO RESUELVE UN MODELO ═══
//
// HORMISERV: cheque n°373 de $2.953.997 DEBITADO el 27/08, y la factura de $2.355.725 del 04/08
// sigue en "Pendiente". Ninguno de los dos tiene número de comprobante. No es un problema de
// escritura del nombre —el proveedor es idéntico en las dos planillas—: es un dato que nadie cargó.
// Ningún modelo de lenguaje inventa un número de comprobante que no existe. Se reporta y lo completa
// una persona.
//
// ═══ LOS TRES HUECOS QUE SE REPORTAN, Y POR QUÉ ESOS ═══
//
//   PAGADO_SIN_BAJA   un cheque DEBITADO y una factura del mismo proveedor todavía "Pendiente".
//                     Es el único de los tres que afecta un número publicado: la deuda del cash
//                     flow está de más. Va primero.
//   SIN_FACTURA       cheques de un proveedor que no tiene NINGUNA fila en Compras. Es gasto que
//                     salió del banco y no está en el P&L: subregistra el costo.
//   MUDO              el cheque no recibió NI ✓ NI ▲. Es el peor de los tres para operar, porque
//                     un renglón vacío no se lee como un problema. Se lo nombra a propósito.
//
// ═══ LO QUE NO HACE, DECLARADO ═══
//
// NO escribe en el Sheet, NO decide que un cheque pagó una factura, y NO cierra deuda: propone.
// Confirmar un pago es Nivel E —efecto económico— y lo firma el dueño. `"VARIAS"` en el número de
// comprobante se trata como AUSENTE, no como un número: es lo que es.

/** Cómo se ve un número de comprobante que en realidad no es un número. */
const NO_ES_NUMERO = /^(varias?|s\/?n|sin|—|-|n\/?a)\b/i

/** ¿El comprobante identifica algo? `"VARIAS · recibo 0010-00000012"` NO: nombra un recibo de pago,
 *  no la factura que se está pagando. Un recibo propio no es el comprobante del proveedor. */
export function comprobanteIdentifica(s) {
  const t = String(s ?? '').trim()
  if (!t) return false
  if (NO_ES_NUMERO.test(t)) return false
  return /\d/.test(t)
}

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/[.,]/g, '')
const esDebitado = (v) => String(v ?? '').trim().toUpperCase() === 'SI'
const pesos = (n) => Math.round(Number(n) || 0)

/**
 * Los huecos del cruce, ordenados por lo que le cuesta a la empresa.
 *
 * @param {Array<{fila:number, proveedor:string, monto:number, comprobante?:string, debitado?:string, estadoOs?:string}>} cheques
 * @param {Array<{fila:number, proveedor:string, monto:number, comprobante?:string, saldoPendiente?:number}>} compras
 * @returns {{pagadoSinBaja:Array, sinFactura:Array, mudos:Array, totales:object}}
 */
export function huecosDeCruce(cheques = [], compras = []) {
  const chs = cheques.map((c) => ({ ...c, prov: norm(c.proveedor), ident: comprobanteIdentifica(c.comprobante) }))
  const cps = compras.map((c) => ({ ...c, prov: norm(c.proveedor) }))
  const provsEnCompras = new Set(cps.map((c) => c.prov))

  // ═══ 1. PAGADO SIN BAJA ═══
  // Sólo cuando NINGUNO de los dos lados tiene número de comprobante: si el cheque lo tiene y la
  // factura también y aun así no cruzaron, son comprobantes DISTINTOS y la pendiente es otra deuda
  // real. Confundir esos dos casos es lo que hace que un control grite de más y deje de leerse.
  const pagadoSinBaja = []
  for (const prov of new Set(chs.map((c) => c.prov))) {
    const debitadosSinNumero = chs.filter((c) => c.prov === prov && esDebitado(c.debitado) && !c.ident)
    if (!debitadosSinNumero.length) continue
    const pendientesSinNumero = cps.filter((c) => c.prov === prov && Number(c.saldoPendiente) > 0 && !comprobanteIdentifica(c.comprobante))
    if (!pendientesSinNumero.length) continue
    pagadoSinBaja.push({
      proveedor: prov,
      cheques: debitadosSinNumero.map((c) => ({ fila: c.fila, monto: pesos(c.monto) })),
      facturas: pendientesSinNumero.map((c) => ({ fila: c.fila, pendiente: pesos(c.saldoPendiente) })),
      chequesUsd: debitadosSinNumero.reduce((a, c) => a + pesos(c.monto), 0),
      pendienteUsd: pendientesSinNumero.reduce((a, c) => a + pesos(c.saldoPendiente), 0),
    })
  }
  pagadoSinBaja.sort((a, b) => b.pendienteUsd - a.pendienteUsd)

  // ═══ 2. CHEQUE DE UN PROVEEDOR QUE NO ESTÁ EN COMPRAS ═══
  const porProv = new Map()
  for (const c of chs) {
    if (provsEnCompras.has(c.prov)) continue
    const acc = porProv.get(c.prov) ?? { proveedor: c.prov, monto: 0, filas: [] }
    acc.monto += pesos(c.monto); acc.filas.push(c.fila)
    porProv.set(c.prov, acc)
  }
  const sinFactura = [...porProv.values()].sort((a, b) => b.monto - a.monto)

  // ═══ 3. LOS MUDOS ═══
  const mudos = chs.filter((c) => !String(c.estadoOs ?? '').trim())
    .map((c) => ({ fila: c.fila, proveedor: c.prov, monto: pesos(c.monto), debitado: esDebitado(c.debitado) }))
    .sort((a, b) => b.monto - a.monto)

  return {
    pagadoSinBaja,
    sinFactura,
    mudos,
    totales: {
      cheques: chs.length,
      sinNumeroDeComprobante: chs.filter((c) => !c.ident).length,
      montoSinNumero: chs.filter((c) => !c.ident).reduce((a, c) => a + pesos(c.monto), 0),
      montoPagadoSinBaja: pagadoSinBaja.reduce((a, h) => a + h.pendienteUsd, 0),
      montoSinFactura: sinFactura.reduce((a, h) => a + h.monto, 0),
      montoMudo: mudos.reduce((a, c) => a + c.monto, 0),
    },
  }
}
