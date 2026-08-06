// LA GEOMETRÍA DE "Cheques Emitidos" ES UNA SOLA, Y ACÁ SE PRUEBA QUE LOS CINCO LA IMPORTEN.
//
// El defecto que este archivo ataja no es "el número está mal": es que el número estaba escrito CINCO
// veces, con TRES valores distintos, y ninguno era el real. Cuatro de los cinco leían desde la fila 2
// —adentro de la banda de rótulos— y ninguno daba error. Un test que compare cada consumidor contra
// un literal repetiría el problema; éste los compara contra el módulo de geometría.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BANDA, FILA_HDR, FILA_DATO0, FILA_FIN, rangoAbierto, rangoCerrado, rangoEn } from './cheques-emitidos-geometria.mjs'
import { INSTRUMENTOS, rangoInstrumento } from './cash-flow-lineas.mjs'
import { deChequesEmitidos } from './libro-extractores.mjs'
import { grillaAnexo } from './caja-anexo.mjs'
import { GRUPOS } from './conciliacion-por-naturaleza.mjs'
import { MARCAS } from './cheques-cobertura.mjs'

test('la geometría es coherente consigo misma: banda, encabezado y primer dato son contiguos', () => {
  assert.equal(FILA_HDR, BANDA + 1, 'el encabezado del registro va justo debajo de la banda')
  assert.equal(FILA_DATO0, FILA_HDR + 1, 'el primer dato va justo debajo del encabezado')
  assert.equal(rangoAbierto('F'), `$F$${FILA_DATO0}:$F`)
  assert.equal(rangoCerrado('K'), `$K$${FILA_DATO0}:$K$${FILA_FIN}`)
  assert.equal(rangoEn('Cheques Emitidos', 'I'), `'Cheques Emitidos'!$I$${FILA_DATO0}:$I$${FILA_FIN}`)
})

test('"Tipo" cae dentro de la ventana A1:A30 que busca cheques-emitidos-sync-banco', () => {
  // Ese script se ancla al DATO VIVO a propósito y no importa esta geometría: es el que avisa si
  // alguien mueve el registro sin pasar por acá. Pero sólo mira las primeras 30 filas, así que una
  // banda que crezca de más lo dejaría ciego sin un solo error.
  assert.ok(FILA_HDR <= 30, `el encabezado quedó en la fila ${FILA_HDR}: cheques-emitidos-sync-banco no lo va a encontrar`)
})

test('cash-flow-lineas: INSTRUMENTOS.cheques.filaCab sale de la geometría', () => {
  assert.equal(INSTRUMENTOS.cheques.filaCab, FILA_HDR)
  // Y lo que de verdad importa: el rango que se le arma a cualquier columna arranca en el primer dato.
  for (const col of ['F', 'I', 'K', 'H']) {
    assert.equal(rangoInstrumento(INSTRUMENTOS.cheques, col), rangoEn(INSTRUMENTOS.cheques.pestaña, col))
  }
})

test('el tope de 400 de cash-flow-lineas y el de la geometría son el mismo número', () => {
  // No se importa uno del otro porque el de allá gobierna también a la tarjeta, que no depende de
  // CAJA!H15. Pero si divergen, los cheques de las últimas filas desaparecen de un lado y del otro no.
  assert.ok(rangoInstrumento(INSTRUMENTOS.cheques, 'F').endsWith(`$${FILA_FIN}`),
    `cash-flow-lineas dejó de cortar en la fila ${FILA_FIN}`)
})

test('libro-extractores: el default de deChequesEmitidos es la primera fila de datos', () => {
  // Se prueba por el EFECTO: una grilla donde el encabezado está exactamente en FILA_HDR y hay un
  // solo cheque en FILA_DATO0. Si el default se corriera, no encontraría el encabezado y rompería.
  const filas = []
  filas[FILA_HDR - 1] = ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio', 'Estado en el OS']
  filas[FILA_DATO0 - 1] = ['ECHEQ', '313', 46000, '20-1-3', 'PROVEEDOR SA', 1000, 'FA', '1-1', 46200, '', 'No', '', MARCAS.falta]
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = []
  const ms = deChequesEmitidos(filas)
  assert.equal(ms.length, 1, 'con el default puesto en la geometría tiene que ver el único cheque')
  assert.equal(ms[0].origen.fila, FILA_DATO0)
})

test('caja-anexo-controles: TODOS sus rangos a Cheques Emitidos arrancan en la primera fila de datos', () => {
  const g = grillaAnexo({})
  const refs = JSON.stringify(g.filas).match(/Cheques Emitidos'!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/g) || []
  assert.ok(refs.length >= 6, `esperaba varias referencias y encontré ${refs.length}: el test dejó de mirar lo que decía mirar`)
  for (const r of refs) {
    assert.match(r, new RegExp(`\\$${FILA_DATO0}:\\$[A-Z]+\\$${FILA_FIN}$`),
      `"${r}" no arranca en la fila ${FILA_DATO0}: se está comiendo la banda de rótulos`)
  }
})

test('conciliacion-por-naturaleza: el grupo de cheques lee el registro, no la banda', () => {
  const grupo = GRUPOS.find((x) => x.pestana === 'Cheques Emitidos')
  const textos = [grupo.formula('D1', 'E1'), grupo.detalle()]
  for (const t of textos) {
    const refs = t.match(/Cheques Emitidos'!\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/g) || []
    assert.ok(refs.length, 'el grupo dejó de citar la pestaña por rango')
    for (const r of refs) {
      assert.match(r, new RegExp(`\\$${FILA_DATO0}:\\$[A-Z]+\\$${FILA_FIN}$`), `"${r}" arranca fuera del registro`)
    }
  }
})
