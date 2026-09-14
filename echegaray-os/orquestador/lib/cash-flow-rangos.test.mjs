// LOS RANGOS DEL CUADRO SALEN DEL RÓTULO — antes y después de insertar «Obra» (14/09/2026).
//
// Lo que se defiende: que ninguna de las columnas que el cash flow suma quede apuntando a la de al
// lado cuando la pestaña se corre, y que un rótulo que falta sea un error y no una letra de respaldo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { rangosDelCuadro, ubicarPorPrefijo, cobranzasDelCuadro } from './cash-flow-rangos.mjs'
import { RANGOS_ANTES, RANGOS_DESPUES, COBRANZAS_1409_HASTA_BB } from './cash-flow-rangos-referencia.mjs'
import { COMPRAS_2508 } from './encabezados-referencia.mjs'
import { letraDeOtraPestana } from './letra-de-otra-pestana.mjs'

test('con el encabezado de hoy, los rangos son los mismos que las constantes que reemplazan', () => {
  assert.deepEqual({ ...RANGOS_ANTES.compras }, {
    sub: 'Compras!$AF$4:$AF', rubro: 'Compras!$AC$4:$AC', fecha: 'Compras!$AD$4:$AD',
    total: 'Compras!$O$4:$O', proveedor: 'Compras!$E$4:$E', factura: 'Compras!$C$4:$C',
  })
  assert.deepEqual({ ...RANGOS_ANTES.cobranzas }, {
    unidad: 'Cobranzas!$F$5:$F$400', monto: 'Cobranzas!$M$5:$M$400', estado: 'Cobranzas!$O$5:$O$400',
    venc: 'Cobranzas!$P$5:$P$400', cobro: 'Cobranzas!$Q$5:$Q$400', cliente: 'Cobranzas!$G$5:$G$400',
    valorBanco: 'Cobranzas!$BB$5:$BB$400',
  })
})

test('con «Obra» insertada, cada rango se corre una letra — y la unidad y el proveedor, que están a la izquierda, no', () => {
  assert.deepEqual({ ...RANGOS_DESPUES.compras }, {
    sub: 'Compras!$AG$4:$AG', rubro: 'Compras!$AD$4:$AD', fecha: 'Compras!$AE$4:$AE',
    total: 'Compras!$P$4:$P', proveedor: 'Compras!$E$4:$E', factura: 'Compras!$C$4:$C',
  })
  assert.deepEqual({ ...RANGOS_DESPUES.cobranzas }, {
    unidad: 'Cobranzas!$F$5:$F$400', monto: 'Cobranzas!$N$5:$N$400', estado: 'Cobranzas!$P$5:$P$400',
    venc: 'Cobranzas!$Q$5:$Q$400', cobro: 'Cobranzas!$R$5:$R$400', cliente: 'Cobranzas!$G$5:$G$400',
    valorBanco: 'Cobranzas!$BC$5:$BC$400',
  })
})

test('un rótulo que falta es un ERROR con su nombre, nunca una letra de respaldo', () => {
  const sinFecha = COMPRAS_2508.map((r) => (r === 'Fecha de caja' ? 'Fecha de pago' : r))
  assert.throws(() => rangosDelCuadro({ compras: sinFecha }), /Fecha de caja/)
  // «Rubro de caja» se pide por su SEGUNDA aparición: con una sola, el cuadro sumaría la columna fósil.
  let visto = false
  const unRubro = COMPRAS_2508.filter((r) => { if (r !== 'Rubro de caja') return true; if (visto) return false; visto = true; return true })
  assert.throws(() => rangosDelCuadro({ compras: unRubro }), /2\.ª «Rubro de caja»/)
  assert.throws(() => rangosDelCuadro({}), /fila de rótulos de Compras/)
})

test('«Qué dice el banco» se sigue por el comienzo del rótulo: la fecha del corte cambia todos los días', () => {
  const otroDia = COBRANZAS_1409_HASTA_BB.map((r) => (String(r).startsWith('Qué dice') ? 'Qué dice el banco de este valor · al 2026-10-01' : r))
  assert.equal(cobranzasDelCuadro(otroDia).valorBanco, 'Cobranzas!$BB$5:$BB$400')
  const sinColumna = COBRANZAS_1409_HASTA_BB.slice(0, 52)
  assert.throws(() => cobranzasDelCuadro(sinColumna), /hay 0/)
  assert.throws(() => ubicarPorPrefijo(['Qué dice el banco de este valor', 'Qué dice el banco de este valor · al x'], 'Qué dice el banco', 'Cobranzas'), /hay 2/)
})

test('una letra fija sólo se admite para pestañas que no se corren', () => {
  assert.equal(letraDeOtraPestana('Cheques Emitidos', 'F'), 'F')
  assert.equal(letraDeOtraPestana('_BANCO_RAW', 'C'), 'C')
  for (const p of ['Compras', 'Cobranzas', "'Compras'", '02_Cobranzas']) {
    assert.throws(() => letraDeOtraPestana(p, 'O'), /rótulo/, p)
  }
  assert.throws(() => letraDeOtraPestana('', 'A'), /falta la pestaña/)
  assert.throws(() => letraDeOtraPestana('_ARCA_RAW', 'A1'), /no es una letra/)
})
