// LO QUE TIENE QUE PASAR SÍ O SÍ AL CARGAR EL REGISTRO DE «Cheques Emitidos» A LA BASE.
//
// Los tres casos de abajo no son hipótesis: los tres están en el registro real de hoy, y los tres
// fallan EN SILENCIO si el importador no los contempla — con un número más chico, no con un error.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aCheque, aISO, estadoDe, clave, planDeCarga, verificarEncabezado, norm,
} from './cheques-desde-registro.mjs'

const CORTE = '2026-08-21'
/** Una fila del registro: [Tipo,Nro,emisión,CUIT,Proveedor,Monto,TipoComp,NroComp,pago,pagoJ,DEBITADO,Unidad,estadoOS] */
const fila = (o = {}) => {
  const f = ['ECHEQ', '300', 46000, '', 'Proveedor SA', 100000, 'FA', '0001-1', 46030, 46030, 'No', 'Civil', '']
  for (const [k, v] of Object.entries({ tipo: 0, numero: 1, emision: 2, cuit: 3, prov: 4, monto: 5, tc: 6, nc: 7, pago: 8, pagoJ: 9, deb: 10, unidad: 11 })) {
    if (o[k] !== undefined) f[v] = o[k]
  }
  return f
}

test('TRAMPA 1 · el FISICO 313 y el ECHEQ 313 son dos cheques, no uno', () => {
  // En el registro real: ECHEQ 313 a Maderas Literas $383.175 y FISICO 313 a Corralón Progreso
  // $470.945. Con la clave vieja (sólo el número) el segundo pisaba al primero en un UPSERT.
  const registro = [
    { fila: 83, r: fila({ tipo: 'ECHEQ', numero: '313', prov: 'Maderas Literas SRL', monto: 383175 }) },
    { fila: 91, r: fila({ tipo: 'FISICO', numero: '313', prov: 'Corralon Progreso', monto: 470945 }) },
  ]
  const p = planDeCarga({ registro, base: [], corte: CORTE })
  assert.equal(p.conflictos.length, 0, 'instrumentos distintos NO son un conflicto')
  assert.equal(p.nuevos.length, 2, 'se perdió un cheque: la clave no mira el instrumento')
  assert.notEqual(clave(p.nuevos[0]), clave(p.nuevos[1]))
  assert.equal(p.nuevos.reduce((a, c) => a + c.importe, 0), 854120)
})

test('TRAMPA 2 · dos filas con la MISMA clave se denuncian, no se fusionan', () => {
  // El FISICO 316 está dos veces (Diesel Rodríguez $500.000 y $510.000). Elegir una y seguir publica
  // un número plausible y equivocado; fusionarlas pierde $510.000 sin dar error.
  const registro = [
    { fila: 101, r: fila({ tipo: 'FISICO', numero: '316', prov: 'Diesel Rodriguez', monto: 500000 }) },
    { fila: 102, r: fila({ tipo: 'FISICO', numero: '316', prov: 'Diesel Rodriguez', monto: 510000 }) },
  ]
  const p = planDeCarga({ registro, base: [], corte: CORTE })
  assert.equal(p.conflictos.length, 1)
  assert.deepEqual(p.conflictos[0].filas.map((f) => f.fila), [101, 102])
  assert.equal(p.nuevos.length, 0, 'no se carga NINGUNA de las dos hasta que alguien lo resuelva')
})

test('TRAMPA 2b · con la evidencia del banco, la corrección entra y queda escrita', () => {
  // El extracto: 13/08 «Cheque debitado» ref 316 $-500.000 y ref 317 $-510.000. Lo afirma el banco.
  const registro = [
    { fila: 101, r: fila({ tipo: 'FISICO', numero: '316', prov: 'Diesel Rodriguez', monto: 500000 }) },
    { fila: 102, r: fila({ tipo: 'FISICO', numero: '316', prov: 'Diesel Rodriguez', monto: 510000 }) },
  ]
  const correcciones = { 'FISICO|316@510000': { numero: '317', porque: 'el extracto del 13/08 debita 316 por $500.000 y 317 por $510.000' } }
  const p = planDeCarga({ registro, base: [], corte: CORTE, correcciones })
  assert.equal(p.conflictos.length, 0)
  assert.equal(p.nuevos.length, 2)
  const corregido = p.nuevos.find((c) => c.numero === '317')
  assert.ok(corregido, 'la corrección no se aplicó')
  assert.match(corregido.corregido, /extracto/, 'una corrección sin su evidencia al lado es una invención')
})

test('TRAMPA 3 · la fecha de pago sale de la columna I, no de la J', () => {
  // Las dos se llaman casi igual y difieren en 5 filas del registro real. La I es la que usan las
  // fórmulas de la propia pestaña; la J repite el mismo 26/08 en las cinco.
  const r = fila({ pago: 46264, pagoJ: 46260 }) // I = 30/08, J = 26/08
  const { ok, cheque } = aCheque(r, { fila: 129, corte: CORTE })
  assert.equal(ok, true)
  assert.equal(cheque.fecha_pago, '2026-08-30')
})

test('el encabezado se verifica: una columna insertada desplaza TODO sin dar error', () => {
  const bueno = ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio', 'Estado']
  assert.deepEqual(verificarEncabezado(bueno), [])
  const corrido = ['Tipo', 'Nro', 'NUEVA', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago']
  assert.ok(verificarEncabezado(corrido).length >= 3, 'no avisó de un layout corrido')
})

test('DEBITADO es el inverso EXACTO del sync que va para el otro lado', async () => {
  // Si las dos direcciones no coinciden, un cheque cargado por acá vuelve marcado al revés.
  const { debitadoDe } = await import('./cheques-emitidos-sync.mjs')
  assert.equal(estadoDe('SI'), 'Pagado')
  assert.equal(estadoDe('No'), 'Aceptado')
  assert.equal(debitadoDe(estadoDe('SI')), 'SI')
  assert.equal(debitadoDe(estadoDe('No')), 'No')
  assert.equal(estadoDe('quizás'), null, 'un DEBITADO que no se entiende no se adivina')
})

test('una fila que no se puede leer se DEVUELVE con su motivo, no se descarta', () => {
  const casos = [
    [fila({ tipo: 'TARJETA' }), /instrumento/],
    [fila({ numero: '' }), /sin número/],
    [fila({ monto: 'mil pesos' }), /no es un número positivo/],
    [fila({ monto: 0 }), /no es un número positivo/],
    [fila({ deb: '' }), /DEBITADO/],
    [fila({ pago: '' }), /fecha de pago/],
    [fila({ pago: 1200 }), /fecha de pago/], // un serial de 1903: un monto que cayó en la columna
  ]
  for (const [r, re] of casos) {
    const res = aCheque(r, { fila: 1, corte: CORTE })
    assert.equal(res.ok, false, `debió rechazar: ${JSON.stringify(r)}`)
    assert.match(res.motivo, re)
  }
})

test('el registro manda sobre el ESTADO y no sobre el importe ni la fecha', () => {
  // La base entró por la puerta verificada (pantalla del banco + cruce contra el extracto); el
  // registro está tipeado a mano. Pisar la fecha del banco con la tipeada degrada justo el dato que
  // decide si un cheque está vencido. Se denuncia, no se aplica.
  const registro = [
    { fila: 72, r: fila({ tipo: 'ECHEQ', numero: '303', prov: 'Alumetal', monto: 100000, pago: 46031 }) },
  ]
  const base = [{ instrumento: 'ECHEQ', numero: '303', importe: 100000, fecha_pago: '2026-01-08', estado: 'Aceptado' }]
  const p = planDeCarga({ registro, base, corte: CORTE })
  assert.equal(p.cambian.length, 0, 'una fecha distinta NO puede llegar a la lista que se escribe')
  assert.equal(p.discrepan.length, 1)
  assert.match(p.discrepan[0].choca.join(' '), /fecha de pago/)
  // Un importe distinto tampoco se pisa.
  const conMonto = planDeCarga({ registro: [{ fila: 72, r: fila({ tipo: 'ECHEQ', numero: '303', monto: 999999, pago: 46030 }) }], base, corte: CORTE })
  assert.equal(conMonto.cambian.length, 0)
  assert.match(conMonto.discrepan[0].choca.join(' '), /importe/)
})

test('lo que ya está igual no se toca; lo que cambió se marca', () => {
  const registro = [
    { fila: 27, r: fila({ tipo: 'ECHEQ', numero: '300', monto: 100000, deb: 'SI' }) },
    { fila: 28, r: fila({ tipo: 'ECHEQ', numero: '301', monto: 200000 }) },
  ]
  const base = [
    { instrumento: 'ECHEQ', numero: '300', importe: 100000, fecha_pago: '2026-01-08', estado: 'Aceptado' },
    { instrumento: 'ECHEQ', numero: '301', importe: 200000, fecha_pago: '2026-01-08', estado: 'Aceptado' },
  ]
  const p = planDeCarga({ registro, base, corte: CORTE })
  assert.equal(p.nuevos.length, 0)
  assert.equal(p.yaEstan.length, 1)
  assert.equal(p.cambian.length, 1, 'el que pasó a Pagado tiene que salir como cambio')
  assert.match(p.cambian[0].difiere.join(' '), /estado Aceptado → Pagado/)
})

test('el número se normaliza: "00000303" y "303" son el mismo cheque', () => {
  assert.equal(norm('00000303'), '303')
  assert.equal(norm('N° 303'), '303')
  assert.equal(aISO(46264), '2026-08-30')
  assert.equal(aISO(1200), null)
  assert.equal(aISO('30/08/2026'), null, 'un texto no es un serial: se rechaza, no se interpreta')
})
