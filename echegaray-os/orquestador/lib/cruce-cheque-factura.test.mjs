// EL CRUCE CHEQUE ↔ FACTURA, EN FRÍO — con los cheques y las facturas REALES del 06/08/2026.
//
// Las fixtures NO son inventadas: son las filas que se leyeron del archivo vivo el día que se
// midió el agujero de $7.585.223. Cada caso lleva su fila de origen para que se pueda ir a mirar.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cruzar, subconjuntosQueSuman, repartirPorCompra, puertaDeCheque, chequesDelRegistro,
  marcaDelCruce, CONFIANZA, SIN_CRUCE, PUERTA, MAX_CANDIDATAS,
} from './cruce-cheque-factura.mjs'
import { MARCAS } from './cheques-cobertura.mjs'

const CORTE = 46240 // el corte del extracto medido el 06/08/2026

// ── LAS FACTURAS REALES (Compras, pagadas con cheque/echeq) ──────────────────────────────────────
const F = {
  diesel460: { fila: 633, proveedor: 'Diesel Rodriguez', comprobante: '0003-00000460', total: 2009999.9942, fecha: 46190, instrumento: 'cheque', rubro: 'Estructura', cliente: '', obra: '', cuit: '20123456789' },
  // DOS filas con el MISMO N° de comprobante: es lo que hace ambiguos a los cheques 325 y 326.
  diesel468a: { fila: 728, proveedor: 'Diesel Rodriguez', comprobante: '0003-00000468', total: 679999, fecha: 46204, instrumento: 'cheque', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '20123456789' },
  diesel468b: { fila: 737, proveedor: 'Diesel Rodriguez', comprobante: '0003-00000468', total: 680000, fecha: 46203, instrumento: 'cheque', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '20123456789' },
  corralon1096: { fila: 636, proveedor: 'Corralon Progreso', comprobante: '0003-00001096', total: 1883777.5374, fecha: 46190, instrumento: 'cheque', rubro: 'Materiales Mantenimiento', cliente: '', obra: '', cuit: '30111111119' },
  dupec: { fila: 670, proveedor: 'DUPEC', comprobante: '00009-00003184', total: 635020.1, fecha: 46226, instrumento: 'echeq', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '30222222229' },
  alvarado: { fila: 730, proveedor: 'Alvarado Mariel Edith', comprobante: '1919017', total: 429048.5034, fecha: 46226, instrumento: 'echeq', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '27333333339' },
  consec1: { fila: 668, proveedor: 'Con-Sec - Lopez Claudia Alejandra', comprobante: '00003-00004295', total: 1191294.61, fecha: 46226, instrumento: 'echeq', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '27444444449' },
  consec2: { fila: 703, proveedor: 'Con-Sec - Lopez Claudia Alejandra', comprobante: '00003-00004295', total: 436294.54, fecha: 46225, instrumento: 'echeq', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '27444444449' },
  consec3: { fila: 720, proveedor: 'Con-Sec - Lopez Claudia Alejandra', comprobante: '00003-00004295', total: 72410.03, fecha: 46225, instrumento: 'echeq', rubro: 'Materiales Civil', cliente: '', obra: '', cuit: '27444444449' },
}
const COMPRAS = Object.values(F)

// ── LOS CHEQUES REALES DEL REGISTRO (fila 27 en adelante) ────────────────────────────────────────
const ch = (o) => ({ instrumento: 'cheque', numero: '', proveedor: '', comprobante: '', fechaPago: null, debitado: false, marca: '', ...o })
const C = {
  // f97/f98: los DOS cheques de $500.000 de la misma factura que YA debitaron. Están en el saldo.
  d314: ch({ fila: 97, numero: '314', proveedor: 'Diesel Rodriguez', importe: 500000, comprobante: '0003-00000460', fechaPago: 46231, debitado: true }),
  d315: ch({ fila: 98, numero: '315', proveedor: 'Diesel Rodriguez', importe: 500000, comprobante: '0003-00000460', fechaPago: 46231, debitado: true }),
  // f101/f102: VIVOS, y los dos se llaman "316" — el registro repite el número.
  d316a: ch({ fila: 101, numero: '316', proveedor: 'Diesel Rodriguez', importe: 500000, comprobante: '0003-00000460', fechaPago: 46251 }),
  d316b: ch({ fila: 102, numero: '316', proveedor: 'Diesel Rodriguez', importe: 510000, comprobante: '0003-00000460', fechaPago: 46251 }),
  corr312: ch({ fila: 103, numero: '312', proveedor: 'Corralon Progreso', importe: 470944, comprobante: '0003-00001096', fechaPago: 46256 }),
  d325: ch({ fila: 114, numero: '325', proveedor: 'Diesel Rodriguez', importe: 340000, comprobante: '0003-00000468', fechaPago: 46244 }),
  d326: ch({ fila: 115, numero: '326', proveedor: 'Diesel Rodriguez', importe: 340000, comprobante: '0003-00000468', fechaPago: 46264 }),
  alvarado: ch({ fila: 124, instrumento: 'echeq', numero: '364', proveedor: 'Alvarado Mariel Edith', importe: 429049, fechaPago: 46247 }),
  consec: ch({ fila: 125, instrumento: 'echeq', numero: '365', proveedor: 'Con-Sec - Lopez Claudia Alejandra', importe: 1700000, fechaPago: 46263 }),
  dupec: ch({ fila: 126, instrumento: 'echeq', numero: '366', proveedor: 'DUPEC', importe: 635020, fechaPago: 46254 }),
  alumetal: ch({ fila: 129, instrumento: 'echeq', numero: '368', proveedor: 'Alumetal', importe: 837210, fechaPago: 46269 }),
}
const CHEQUES = Object.values(C)

test('(a) LA LLAVE NATURAL: el N° de comprobante del cheque contra el de Compras', () => {
  const r = cruzar([C.d316a, C.d316b, C.corr312], COMPRAS)
  assert.equal(r.porCheque.get(101).confianza, CONFIANZA.comprobante)
  assert.deepEqual(r.porCheque.get(101).compras.map((f) => f.fila), [633])
  assert.deepEqual(r.porCheque.get(102).compras.map((f) => f.fila), [633])
  // "0003-00001096" contra "0003-00001096": mismo proveedor, misma factura.
  assert.deepEqual(r.porCheque.get(103).compras.map((f) => f.fila), [636])
})

test('EL DEBITADO NO SE CRUZA: su plata ya está en el saldo del banco, no es un compromiso', () => {
  const r = cruzar([C.d314, C.d315], COMPRAS)
  assert.equal(r.porCheque.size, 0)
  assert.equal(r.resumen.vivos.cheques, 0)
})

test('EL DEFECTO MEDIDO: dos filas de Compras con el MISMO N° hacen AMBIGUO al cheque, no un cruce', () => {
  // Registro vivo: los cheques FISICO 325 y 326 dicen "0003-00000468" y en Compras hay DOS filas con
  // ese número ($679.999 y $680.000). Elegir una pondría $680.000 de compromiso en la fila
  // equivocada y nadie lo vería nunca más.
  const r = cruzar([C.d325, C.d326], COMPRAS)
  assert.equal(r.porCheque.size, 0)
  assert.equal(r.ambiguos.length, 2)
  assert.equal(r.ambiguos[0].porque, SIN_CRUCE.ambiguo)
  assert.deepEqual(r.ambiguos[0].candidatas.sort(), [728, 737])
  assert.equal(r.resumen.ambiguos.monto, 680000)
})

test('(b) SIN N°: una sola factura del mismo proveedor por exactamente esa plata', () => {
  const r = cruzar([C.alvarado, C.dupec], COMPRAS)
  assert.equal(r.porCheque.get(124).confianza, CONFIANZA.importe)
  assert.deepEqual(r.porCheque.get(124).compras.map((f) => f.fila), [730])
  assert.equal(r.porCheque.get(126).confianza, CONFIANZA.importe)
  assert.deepEqual(r.porCheque.get(126).compras.map((f) => f.fila), [670])
})

test('(c) "VARIAS": el echeq de Con-Sec paga TRES facturas que suman su importe', () => {
  // $1.191.294,61 + $436.294,54 + $72.410,03 = $1.699.999,18 y el echeq dice $1.700.000 redondos.
  // Ése es el caso que la tolerancia de UN PESO existe para atrapar.
  const r = cruzar([C.consec], COMPRAS)
  assert.equal(r.porCheque.get(125).confianza, CONFIANZA.conjunto)
  assert.deepEqual(r.porCheque.get(125).compras.map((f) => f.fila).sort(), [668, 703, 720])
})

test('SIN CRUCE se declara, no se adivina: el echeq 368 de Alumetal no tiene factura ni conjunto', () => {
  const r = cruzar([C.alumetal], COMPRAS)
  assert.equal(r.porCheque.size, 0)
  assert.equal(r.sinCruce.length, 1)
  assert.equal(r.sinCruce[0].porque, SIN_CRUCE.sinRespaldo)
  assert.equal(r.resumen.sinCruce.monto, 837210)
})

test('EL N° QUE NO ESTÁ EN COMPRAS se declara "falta la factura", no "sin respaldo"', () => {
  const neumagom = ch({ fila: 104, instrumento: 'echeq', numero: '308', proveedor: 'NEUMAGOM SAS', importe: 317000, comprobante: '00002-00003930', fechaPago: 46274 })
  const r = cruzar([neumagom], COMPRAS)
  assert.equal(r.sinCruce[0].porque, SIN_CRUCE.sinFactura)
})

test('EL DEFECTO DEL RECORTE: truncar el universo esconde la ambigüedad — no la resuelve', () => {
  // La primera versión miraba las 40 facturas más grandes. Corralón tiene 62 en la ventana: con el
  // recorte había UN conjunto que sumaba $323.000 y el cruce lo daba por bueno; con las 62 hay DOS.
  // Una búsqueda truncada no puede probar unicidad, así que devuelve `null` — y `null` NO es "no hay".
  const muchas = Array.from({ length: MAX_CANDIDATAS + 1 }, (_, i) => ({ fila: i + 1, total: 1000 + i }))
  assert.equal(subconjuntosQueSuman(muchas, 2001), null)
  const pocas = [{ fila: 1, total: 1000 }, { fila: 2, total: 1001 }]
  assert.equal(subconjuntosQueSuman(pocas, 2001).length, 1)
})

test('DOS CONJUNTOS QUE SUMAN LO MISMO es ambiguo — el conjunto no identifica nada', () => {
  const pool = [{ fila: 1, total: 300 }, { fila: 2, total: 200 }, { fila: 3, total: 100 }, { fila: 4, total: 400 }]
  // 300+200 = 400+100 = 500. Dos caminos al mismo número.
  assert.equal(subconjuntosQueSuman(pool, 500).length, 2)
})

test('UN CHEQUE REDONDO REPETIDO ES UN PLAN DE PAGO: seis de $750.000 no cruzan por conjunto', () => {
  // El caso real de Corralón Progreso: seis cheques de $750.000 clavados, uno el 10 de cada mes.
  // Hay UN conjunto de facturas que suma eso — pero no alcanza para seis, y repartirlo sería inventar.
  const facturas = [
    { fila: 1, proveedor: 'Corralon Progreso', comprobante: '', total: 400000, fecha: 46240, instrumento: 'cheque' },
    { fila: 2, proveedor: 'Corralon Progreso', comprobante: '', total: 350000, fecha: 46240, instrumento: 'cheque' },
  ]
  const seis = Array.from({ length: 6 }, (_, i) => ch({ fila: 108 + i, numero: String(318 + i), proveedor: 'Corralon Progreso', importe: 750000, fechaPago: 46255 }))
  const r = cruzar(seis, facturas)
  assert.equal(r.porCheque.size, 0)
  assert.equal(r.ambiguos.length, 6)
  // Y con UNO solo, el mismo conjunto sí cruza: lo que descalifica es la repetición, no el importe.
  const uno = cruzar([seis[0]], facturas)
  assert.equal(uno.porCheque.get(108).confianza, CONFIANZA.conjunto)
})

test('EL REPARTO NO PASA DEL TOTAL DE LA FACTURA: el exceso se declara, no se resta del REAL', () => {
  // f633 debe $2.010.000; ya debitaron $1.000.000 y quedan vivos $1.010.000. La fila se PARTE.
  const r = cruzar([C.d316a, C.d316b], COMPRAS)
  const p = r.porCompra.get(633)
  assert.equal(Math.round(p.vivo), 1010000)
  assert.equal(p.exceso, 0)
  assert.equal(p.cuotas.length, 2)
  // Un cheque de más contra una factura chica es un dato mal cargado: se topea y se declara.
  const gigante = ch({ fila: 200, numero: '999', proveedor: 'DUPEC', importe: 5000000, comprobante: '00009-00003184', fechaPago: 46254 })
  const q = repartirPorCompra(new Map([[200, { cheque: gigante, compras: [F.dupec], confianza: CONFIANZA.comprobante }]]), [F.dupec])
  assert.equal(Math.round(q.get(670).vivo), 635020)
  assert.ok(q.get(670).exceso > 4000000)
})

test('LA PARTICIÓN: cada cheque vivo entra por UNA puerta, y las tres bolsas suman el registro', () => {
  const cruce = cruzar(CHEQUES, COMPRAS)
  const vivos = CHEQUES.filter((c) => !c.debitado)
  const bolsas = { [PUERTA.compras]: [], [PUERTA.cheques]: [], [PUERTA.ninguna]: [] }
  for (const c of vivos) bolsas[puertaDeCheque(c, cruce, { marcaFalta: '⚠ FALTA' })].push(c.fila)
  const todas = Object.values(bolsas).flat()
  assert.equal(todas.length, vivos.length, 'una puerta por cheque, ni cero ni dos')
  assert.equal(new Set(todas).size, todas.length, 'ningún cheque en dos bolsas')
  // Los cruzados van por Compras (cuotas). CONTRATO NUEVO (02/09): los ambiguos y sin cruce ya no
  // caen al vacío — un cheque firmado es un egreso avalado por sí mismo y entra por Cheques.
  assert.deepEqual(bolsas[PUERTA.compras].sort((a, b) => a - b), [101, 102, 103, 124, 125, 126])
  assert.deepEqual(bolsas[PUERTA.ninguna], [])
  assert.ok([114, 115, 129].every((f) => bolsas[PUERTA.cheques].includes(f)), 'el residuo entra por Cheques')
  // Un cheque marcado "falta la factura" y NO cruzado sigue entrando por su propia puerta.
  const huerfano = ch({ fila: 122, numero: '328', proveedor: 'Nadie SRL', importe: 1000000, marca: '⚠ FALTA' })
  assert.equal(puertaDeCheque(huerfano, cruzar([huerfano], COMPRAS), { marcaFalta: '⚠ FALTA' }), PUERTA.cheques)
  // Y el debitado no entra por ninguna: ya está en el saldo del banco.
  assert.equal(puertaDeCheque(C.d314, cruce, { marcaFalta: '⚠ FALTA' }), PUERTA.ninguna)
})

test('EL RESUMEN CUENTA PLATA, NO FILAS: los $7,58M del 06/08 se reparten sin perder un peso', () => {
  const cruce = cruzar(CHEQUES, COMPRAS)
  const r = cruce.resumen
  const repartido = r.porComprobante.monto + r.porImporte.monto + r.porConjunto.monto
    + r.ambiguos.monto + r.sinCruce.monto
  assert.equal(Math.round(repartido), Math.round(r.vivos.monto), 'ningún cheque vivo se cae del veredicto')
  assert.equal(r.porComprobante.cheques + r.porImporte.cheques + r.porConjunto.cheques
    + r.ambiguos.cheques + r.sinCruce.cheques, r.vivos.cheques)
})

test('chequesDelRegistro lee el registro por su geometría, no desde la fila 1', () => {
  const filas = [
    ['banda'], ['banda'],
    ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad', 'Estado en el OS'],
    ['ECHEQ', 366, 46220, '', 'DUPEC', 635020, 'FA', '', 46254, 46254, 'No', 'Civil', '≈ INFERIDO'],
    ['FISICO', 314, 46200, '', 'Diesel Rodriguez', 500000, 'FA', '0003-00000460', 46231, 46231, 'SI', 'Civil', '✓'],
  ]
  const r = chequesDelRegistro(filas, { fila0: 4 })
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { fila: 4, instrumento: 'echeq', numero: '366', proveedor: 'DUPEC', importe: 635020, comprobante: '', fechaPago: 46254, debitado: false, marca: '≈ INFERIDO' })
  assert.equal(r[1].debitado, true)
  assert.equal(r[1].instrumento, 'cheque')
})

test('LA MARCA DICE LA FILA Y LA FUERZA — un ✓ sobre una inferencia sería presentarla como un hecho', () => {
  const cruce = cruzar(CHEQUES, COMPRAS)
  assert.equal(marcaDelCruce(C.d316a, cruce, MARCAS.sinNumero), '✓ factura fila 633 · cruzado por comprobante')
  // Por importe y por conjunto el glifo es ≈: son atribuciones, no la llave de la factura.
  assert.equal(marcaDelCruce(C.dupec, cruce, MARCAS.sinNumero), '≈ factura fila 670 · cruzado por proveedor+importe')
  assert.equal(marcaDelCruce(C.consec, cruce, MARCAS.sinNumero),
    '≈ factura fila 668 + fila 703 + fila 720 · cruzado por conjunto de facturas')
  // Y lo que el cruce NO empareja conserva EXACTAMENTE la marca de hoy: no se pisa un veredicto ajeno.
  assert.equal(marcaDelCruce(C.alumetal, cruce, MARCAS.sinNumero), MARCAS.sinNumero)
  assert.equal(marcaDelCruce(C.d325, cruce, MARCAS.falta), MARCAS.falta)
})

test('EL CORTE NO ENTRA EN EL CRUCE: un cheque vivo lo es aunque su factura sea de enero', () => {
  // El cruce contesta "de qué factura es este cheque", no "cuándo sale la plata". Mezclar las dos
  // preguntas fue el error original: la fecha decide el ESTADO (eso es `estadoDeEgreso`), no el par.
  const viejo = { ...F.diesel460, fecha: 45900 }
  const r = cruzar([C.d316a], [viejo])
  // Sin ventana no hay cruce por importe, pero la LLAVE no depende de la fecha: cruza igual.
  assert.equal(r.porCheque.get(101).confianza, CONFIANZA.comprobante)
  assert.ok(CORTE > 0)
})
