// Tests del núcleo de importación de cheques. Herméticos: sin red, sin base, sin Google.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  importe, fecha, validar, aFila, clave, novedades, verificarOrdenPago, cartera, soloDigitos,
  cruceEmitidos,
} from './cheques-importar.mjs'
import { conciliarDebitosDeCheques } from './cheques-debito-banco.mjs'

const base = {
  tipo: 'recibido', numero: '00000514', banco: 'Mineral Del Rio', importe: '$290.000,00',
  estado: 'En custodia', origen: 'Santander · pantalla eCHEQ recibidos', corte: '30/07/2026',
}

test('importe lee es-AR y no confunde miles con decimales', () => {
  assert.equal(importe('16.807.425,92'), 16807425.92)
  assert.equal(importe('$ 290.000,00'), 290000)
  assert.equal(importe('1.704.000,00'), 1704000)
  assert.equal(importe(5176500), 5176500)
  // El defecto clásico: leerlo como inglés daría 1.23456 y NO da error.
  assert.equal(importe('1.234,56'), 1234.56)
  assert.equal(importe('(200.000,00)'), -200000)
  assert.equal(importe('sin número'), null)
  assert.equal(importe(''), null)
})

test('fecha exige DD/MM y rechaza lo ilegible', () => {
  assert.equal(fecha('31/07/26'), '2026-07-31')
  assert.equal(fecha('15/08/2026'), '2026-08-15')
  assert.equal(fecha('2026-10-03'), '2026-10-03')
  assert.equal(fecha('31/13/2026'), null) // mes 13
  assert.equal(fecha('no dice'), null)
  assert.equal(fecha(''), null)
})

test('validar exige lo mínimo para que la fila sirva', () => {
  assert.deepEqual(validar(base), [])
  assert.match(validar({ ...base, tipo: 'otro' })[0], /tipo inválido/)
  assert.match(validar({ ...base, numero: '' })[0], /sin número/)
  assert.match(validar({ ...base, importe: 'x' })[0], /sin importe/)
  assert.match(validar({ ...base, importe: '-5' })[0], /no positivo/)
  assert.match(validar({ ...base, origen: '' })[0], /sin origen/)
  assert.match(validar({ ...base, corte: '' })[0], /sin corte/)
  assert.match(validar({ ...base, fecha_pago: '99/99/99' })[0], /fecha de pago ilegible/)
})

test('aFila normaliza estado, CUIT y fechas sin inventar', () => {
  const f = aFila({ ...base, estado: 'Endoso aceptado', fecha_pago: '31/07/26', librador_cuit: '33-71084865-9' })
  assert.equal(f.estado, 'Endosado')
  assert.equal(f.fecha_pago, '2026-07-31')
  assert.equal(f.librador_cuit, '33710848659')
  assert.equal(f.importe, 290000)
  assert.equal(f.obra, null) // no se inventa
  // Un estado que el banco no usa hoy se conserva tal cual en vez de perderse.
  assert.equal(aFila({ ...base, estado: 'Algo Nuevo' }).estado, 'Algo Nuevo')
})

test('soloDigitos compara CUIT venga como venga', () => {
  assert.equal(soloDigitos('30-62031170-3'), '30620311703')
  assert.equal(soloDigitos('30620311703'), '30620311703')
})

test('la clave natural es tipo+banco+numero (un banco no repite número)', () => {
  const a = aFila(base)
  const b = aFila({ ...base, importe: 999, estado: 'Depositado' })
  assert.equal(clave(a), clave(b)) // mismo cheque, otra foto
  assert.notEqual(clave(a), clave(aFila({ ...base, tipo: 'emitido' })))
  assert.notEqual(clave(a), clave(aFila({ ...base, banco: 'Galicia' })))
})

test('novedades distingue nuevo de CAMBIO DE ESTADO (no son duplicados)', () => {
  const existente = aFila({ ...base, estado: 'En custodia' })
  const mismoDepositado = aFila({ ...base, estado: 'Depositado' })
  const otro = aFila({ ...base, numero: '90020099', banco: 'Alimentos Del Sur', importe: 10000000 })

  const r = novedades([existente], [mismoDepositado, otro])
  assert.equal(r.nuevos.length, 1)
  assert.equal(r.nuevos[0].numero, '90020099')
  assert.equal(r.actualizados.length, 1)
  assert.match(r.actualizados[0].motivo, /estado: En custodia → Depositado/)
  assert.equal(r.iguales.length, 0)
})

test('novedades no cuenta como cambio una relectura idéntica', () => {
  const f = aFila(base)
  const r = novedades([f], [aFila(base)])
  assert.equal(r.iguales.length, 1)
  assert.equal(r.nuevos.length, 0)
  assert.equal(r.actualizados.length, 0)
})

test('novedades avisa si el mismo cheque viene dos veces en el fajo', () => {
  const r = novedades([], [aFila(base), aFila({ ...base, estado: 'Depositado' })])
  assert.equal(r.nuevos.length, 1)
  assert.equal(r.actualizados.length, 1)
  assert.match(r.actualizados[0].motivo, /repetido en el mismo fajo/)
})

test('EL CONTROL: la O/P 4865 real de Messina cierra al centavo', () => {
  // Datos reales de la Orden de Pago 0000000004865 (Manufacturas Químicas Juan Messina, 28/07/2026).
  const cheques = [
    { importe: '1.704.000,00' },   // 29313193 Credicoop 20/07
    { importe: '4.632.663,50' },   // 16097 Galicia 24/07
    { importe: '4.632.663,50' },   // 16092 Galicia 17/07
    { importe: '661.598,92' },     // 19096 Supervielle 15/07
    { importe: '5.176.500,00' },   // 2007 Galicia 22/07
  ]
  const otros = [
    { importe: '282.897,60' },     // retención Ganancias SICORE rég. 78
    { importe: '24.981,28' },      // transferencia Banco Supervielle
  ]
  const r = verificarOrdenPago({ total: '17.115.304,80', cheques, otros })
  assert.equal(r.suma_cheques, 16807425.92) // == el depósito del 29/07 en el extracto
  assert.equal(r.calculado, 17115304.80)
  assert.equal(r.diferencia, 0)
  assert.equal(r.cierra, true)
})

test('EL CONTROL detecta un cheque que falta', () => {
  const r = verificarOrdenPago({ total: '17.115.304,80', cheques: [{ importe: '1.704.000,00' }], otros: [] })
  assert.equal(r.cierra, false)
  assert.equal(r.diferencia, 15411304.80)
})

test('cartera suma por estado sin contar el mismo cheque dos veces', () => {
  const filas = [
    aFila({ ...base, numero: '1', estado: 'En custodia', importe: 10000000 }),
    aFila({ ...base, numero: '2', estado: 'En custodia', importe: 290000 }),
    aFila({ ...base, numero: '3', estado: 'Endosado', importe: 10000000 }),
  ]
  const c = cartera(filas)
  assert.equal(c.length, 2)
  assert.equal(c[0].estado, 'En custodia')
  assert.equal(c[0].importe, 10290000)
  assert.equal(c[0].cantidad, 2)
})

// ── EL CRUCE DE LOS EMITIDOS (14/08) ─────────────────────────────────────────────────────────────
// Los cheques 306, 307, 308 y 309 son todos de $317.000: cuotas iguales a NEUMAGOM. El cruce viejo
// preguntaba "¿hay algún movimiento por $317.000?" y la respuesta era sí para los cuatro, con UN solo
// débito. Un control que confirma cheques que no vio es peor que no tener control.
const NEUMAGOM = ['306', '307', '308', '309'].map((numero) => ({
  instrumento: 'ECHEQ', numero, importe: 317000, estado: 'Pagado', contraparte: 'NEUMAGOM SAS',
}))
const DEBITO_307 = { fecha: '2026-08-04', concepto: 'Echeq clearing recibido 48hs', importe: -317000, referencia: '000000307' }

test('UN débito confirma UN cheque: los otros tres de $317.000 no se dan por verificados', () => {
  const { resultados } = conciliarDebitosDeCheques([DEBITO_307], NEUMAGOM)
  const cruce = cruceEmitidos(NEUMAGOM, resultados)
  assert.equal(cruce.filter((c) => c.movimiento).length, 1)
  assert.equal(cruce.find((c) => c.movimiento).cheque.numero, '307')
  for (const n of ['306', '308', '309']) {
    assert.equal(cruce.find((c) => c.cheque.numero === n).movimiento, null, `el ${n} no lo explica ese débito`)
  }
})

test('el cruce de emitidos distingue FISICO de ECHEQ con el mismo número', () => {
  const cheques = [
    { instrumento: 'FISICO', numero: '313', importe: 470945, estado: 'Pagado' },
    { instrumento: 'ECHEQ', numero: '313', importe: 383175, estado: 'Pagado' },
  ]
  const movs = [{ fecha: '2026-08-06', concepto: 'Cheque debitado', importe: -470945, referencia: '000000313' }]
  const cruce = cruceEmitidos(cheques, conciliarDebitosDeCheques(movs, cheques).resultados)
  assert.equal(cruce[0].movimiento.fecha, '2026-08-06')
  assert.equal(cruce[1].movimiento, null, 'el ECHEQ 313 no salió: su importe es otro')
})

test('un cheque sin instrumento no empareja con nada (antes que emparejar mal, no emparejar)', () => {
  const cheques = [{ instrumento: null, numero: '307', importe: 317000, estado: 'Pagado' }]
  const cruce = cruceEmitidos(cheques, conciliarDebitosDeCheques([DEBITO_307], cheques).resultados)
  assert.equal(cruce[0].movimiento, null)
})
