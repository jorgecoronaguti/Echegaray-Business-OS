// LOS CHEQUES QUE NO SE PUEDEN CRUZAR POR NÚMERO — y hasta dónde se puede llegar sin inventar.
//
// Cada caso de acá salió de una fila REAL del registro "Cheques Emitidos" leída el 05/08/2026. No son
// ejemplos de manual: si el arreglo se revierte, alguno se pone rojo con la plata de verdad adentro.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inferirRespaldo, repartirCobertura, marcaDe, estadoDeCobertura, expresionTieneNumero,
  esLlaveUtil, normComprobante, serialDe, MARCAS, TOL_CHEQUE,
} from './cheques-cobertura.mjs'
import { candidatasPorImporte, TOL_IMPORTE } from './cobertura-arca.mjs'

/** Serial de Sheets de una fecha, para no escribir números mágicos en los casos. */
const S = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CRITERIO DE RESPALDO ES UNO SOLO, PARAMETRIZADO — no dos copias que divergen
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el cruce por proveedor + importe vive en un solo lugar y los dos usos lo parametrizan', () => {
  const filas = [{ fila: 10, prov: 'DUPEC', total: 635020, fecha: S(2026, 8, 1) }]
  // El uso de ARCA: 3% de tolerancia, porque compara el neto del libro contra el Total de Compras.
  assert.equal(candidatasPorImporte({ prov: 'DUPEC', total: 620000 }, filas, { tol: TOL_IMPORTE }).length, 1)
  // El uso del cheque: exacto. Un cheque paga un importe y ese importe se escribe.
  assert.equal(candidatasPorImporte({ prov: 'DUPEC', total: 620000 }, filas, { tol: TOL_CHEQUE }).length, 0)
  assert.equal(candidatasPorImporte({ prov: 'DUPEC', total: 635020 }, filas, { tol: TOL_CHEQUE }).length, 1)
})

test('una fila ya consumida no se ofrece de nuevo: dos cheques no pagan la misma factura', () => {
  const filas = [{ fila: 10, prov: 'DUPEC', total: 635020 }]
  assert.equal(candidatasPorImporte({ prov: 'DUPEC', total: 635020 }, filas, { usadas: new Set([10]) }).length, 0)
})

test('la ventana de fechas descarta la misma factura de otro mes', () => {
  const filas = [{ fila: 10, prov: 'DUPEC', total: 635020, fecha: S(2026, 1, 15) }]
  const item = { prov: 'DUPEC', total: 635020, fecha: S(2026, 8, 15) }
  assert.equal(candidatasPorImporte(item, filas, { ventanaDias: 60 }).length, 0, 'siete meses de distancia y la dio por buena')
  assert.equal(candidatasPorImporte(item, filas, { ventanaDias: null }).length, 1, 'sin ventana, ARCA no debe cambiar de comportamiento')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SE RECUPERA, Y LO QUE NO SE PUEDE RECUPERAR SIN INVENTAR
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('DUPEC: sin N°, pero hay UNA factura del mismo proveedor por el mismo importe → inferido', () => {
  // Fila 119 del registro real: ECHEQ 366, DUPEC, $635.020, paga el 15/08. La factura está en la
  // fila 670 de Compras por exactamente $635.020.
  const cheques = [{ fila: 119, proveedor: 'DUPEC', monto: 635020, comprobante: '', fecha: S(2026, 8, 15) }]
  const compras = [{ fila: 670, prov: 'DUPEC', total: 635020, fecha: S(2026, 7, 28) }]
  const r = inferirRespaldo(cheques, compras, { norm: (s) => String(s ?? '') })
  assert.equal(r.inferidos.get(119)?.filaCompras, 670)
  assert.equal(r.sinRespaldo.length, 0)
})

test('SEIS cheques redondos contra UNA factura: no se infiere ninguno, y ése es el punto', () => {
  // El caso que mató la tolerancia del 3%. Filas 101–106 del registro: seis cheques de $750.000 a
  // Corralón Progreso. En Compras hay UNA sola factura de ese proveedor cerca: $744.526.
  //
  // Con 3% los seis emparejaban contra ella y el primero se la quedaba: un cheque elegido al azar
  // salía del calendario con la etiqueta "ya está contemplado" y el piso subía $750.000 sin que nadie
  // hubiera pagado nada. Un importe redondo es un pago a cuenta, no el total de una factura.
  const cheques = Array.from({ length: 6 }, (_, i) => (
    { fila: 101 + i, proveedor: 'Corralon Progreso', monto: 750000, comprobante: '', fecha: S(2026, 8, 10) }))
  const compras = [{ fila: 763, prov: 'Corralon Progreso', total: 744526, fecha: S(2026, 7, 20) }]
  const norm = (s) => String(s ?? '')

  const exacto = inferirRespaldo(cheques, compras, { norm })
  assert.equal(exacto.inferidos.size, 0, 'con tolerancia exacta $750.000 no puede ser $744.526')
  assert.equal(exacto.sinRespaldo.length, 6)

  // Y AUNQUE ALGUIEN AFLOJARA LA TOLERANCIA, la guarda de ambigüedad lo sigue frenando: seis cheques
  // no pueden repartirse una factura. Es la diferencia entre una inferencia y una moneda al aire.
  const flojo = inferirRespaldo(cheques, compras, { norm, tol: TOL_IMPORTE })
  assert.equal(flojo.inferidos.size, 0, 'eligió uno de seis a ojo y lo sacó del calendario')
  assert.equal(flojo.ambiguos.length, 6)
})

test('dos cheques contra dos facturas iguales: los dos se infieren, ninguno queda ambiguo', () => {
  // La guarda no puede ser "si hay repetidos, nada": cuando las facturas alcanzan, alcanzan.
  const cheques = [
    { fila: 1, proveedor: 'X', monto: 100, comprobante: '', fecha: S(2026, 8, 1) },
    { fila: 2, proveedor: 'X', monto: 100, comprobante: '', fecha: S(2026, 8, 2) },
  ]
  const compras = [
    { fila: 10, prov: 'X', total: 100, fecha: S(2026, 8, 1) },
    { fila: 11, prov: 'X', total: 100, fecha: S(2026, 8, 2) },
  ]
  const r = inferirRespaldo(cheques, compras, { norm: (s) => String(s ?? '') })
  assert.equal(r.inferidos.size, 2)
  assert.equal(r.ambiguos.length, 0)
  assert.notEqual(r.inferidos.get(1).filaCompras, r.inferidos.get(2).filaCompras, 'les dio la misma factura a los dos')
})

test('un cheque CON N° de comprobante no pasa por el respaldo: la llave buena manda', () => {
  const cheques = [{ fila: 1, proveedor: 'Alumetal', monto: 16649000, comprobante: '0038-00025872', fecha: S(2026, 8, 5) }]
  const compras = [{ fila: 9, prov: 'Alumetal', total: 16649000, fecha: S(2026, 8, 5) }]
  const r = inferirRespaldo(cheques, compras, { norm: (s) => String(s ?? '') })
  assert.equal(r.inferidos.size, 0)
  assert.equal(r.sinRespaldo.length, 0, 'lo metió en una lista de faltantes cuando tiene su número')
})

test('la fecha del cheque puede venir como Date y se compara igual contra el serial de Compras', () => {
  // `leer()` arma la fecha con `fechaAR()`, que devuelve un Date; Compras se lee en serial. Sin la
  // conversión, la resta da NaN, NaN<=60 es false y la ventana descartaba TODO en silencio.
  assert.equal(serialDe(new Date(2026, 7, 15)), S(2026, 8, 15))
  const r = inferirRespaldo(
    [{ fila: 1, proveedor: 'X', monto: 100, comprobante: '', fecha: new Date(2026, 7, 15) }],
    [{ fila: 10, prov: 'X', total: 100, fecha: S(2026, 8, 20) }],
    { norm: (s) => String(s ?? '') })
  assert.equal(r.inferidos.size, 1, 'una fecha Date rompió la ventana y se perdió el emparejamiento')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNA INFERENCIA NO ES UN HECHO — y no puede convertirse en uno pasando por una función
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el inferido tiene marca propia y no lleva ✓', () => {
  assert.equal(marcaDe('', new Set(), true), MARCAS.inferido)
  assert.equal(marcaDe('', new Set(), false), MARCAS.sinNumero)
  assert.ok(!MARCAS.inferido.includes('✓'), 'un ✓ acá dice "verificado" sobre algo que se dedujo del importe')
  assert.equal(new Set(Object.values(MARCAS)).size, Object.keys(MARCAS).length, 'dos marcas con el mismo texto: las fórmulas del cash flow contarían las dos filas juntas')
})

test('los inferidos salen de "sin N°" y NO entran en "contemplados"', () => {
  const inst = [
    { fila: 1, comprobante: '06-006452', monto: 880018 },   // su número está en Compras
    { fila: 2, comprobante: '', monto: 635020 },            // inferido
    { fila: 3, comprobante: '', monto: 1700000 },           // hueco
  ]
  const r = repartirCobertura(inst, new Set(['6-6452']), { inferidos: new Map([[2, { filaCompras: 670 }]]) })
  assert.equal(r.monto_contemplado, 880018, 'el inferido se coló entre los verificados')
  assert.equal(r.monto_inferido, 635020)
  assert.equal(r.monto_sin_numero, 1700000, 'el inferido siguió contándose también como sin número: la misma plata dos veces')
  assert.equal(r.monto_contemplado + r.monto_inferido + r.monto_sin_numero + r.monto_falta_factura, r.total)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA MARCA ES UNA FOTO: lo que el OS todavía no miró tiene que verse, no contarse como cubierto
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('un cheque cargado después de la última corrida NO es "su factura está en Compras"', () => {
  // El defecto real del 05/08: ocho cheques por $38.377.479 cargados después del 24/07. El calendario
  // los ignoraba (suma por la marca "FALTA") y el verificador independiente los daba por cubiertos
  // ("todo lo que no dice FALTA ya tiene su factura"). Dos vistas, las dos equivocadas por omisión.
  const inst = [
    { fila: 120, comprobante: '0038-00025871', monto: 14982000, marca: '' },
    { fila: 121, comprobante: '0038-00025872', monto: 16649000, marca: '' },
    { fila: 118, comprobante: '', monto: 1700000, marca: '' },
    { fila: 34, comprobante: '06-006668', monto: 24143, marca: MARCAS.ok },
  ]
  const e = estadoDeCobertura(inst, new Set(['38-25871', '38-25872', '6-6668']), new Map())
  assert.equal(e.montos.sinMarca, 14982000 + 16649000 + 1700000, 'no midió lo que el OS todavía no miró')
  assert.equal(e.sinMarca.length, 3)
  // Y el estado se RECALCULA del dato crudo, no se lee de la marca vieja: dos de esos tres sí tienen
  // su factura cargada, y el que no tiene número queda como hueco declarado.
  assert.equal(e.montos.ok, 14982000 + 16649000 + 24143)
  assert.equal(e.montos.hueco, 1700000)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GEMELA DE FÓRMULA — pin: si una cambia sin la otra, esto se pone rojo
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('pin-esLlaveUtil: la fórmula del Sheet dice lo mismo que el código en los casos reales', () => {
  const f = expresionTieneNumero("'Cheques Emitidos'!$H$2:$H$400")
  // Los dos términos de `esLlaveUtil`, presentes y en la forma array-safe.
  assert.match(f, /FIND\("-"/, 'perdió el término del guión')
  assert.match(f, />=5/, 'perdió el término del largo mínimo')
  assert.ok(!/\bOR\(/.test(f), 'OR() en Sheets no es array-safe: devolvería un único booleano para todo el rango')
  // Y la gemela de código, sobre los mismos casos del registro real.
  for (const [crudo, esperado] of [
    ['0038-00025872', true], ['0001-000036', true], ['00003-00012792', true],
    ['3617 y 3650', true], ['7206', false], ['', false],
  ]) assert.equal(esLlaveUtil(normComprobante(crudo)), esperado, `esLlaveUtil("${crudo}")`)
})
