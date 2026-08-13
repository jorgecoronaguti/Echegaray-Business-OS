// LA CONCILIACIÓN DE HABERES EN FRÍO — con las quincenas y los lotes reales del Santander.
//
// Los casos son los tres defectos que cuestan plata: que un pago individual se cuele en la quincena en
// curso (y descargue la quincena entera de la caja), que un mismo pago respalde dos quincenas, y que un
// pago que el extracto todavía no muestra desaparezca de la vista.
import test from 'node:test'
import assert from 'node:assert/strict'
import { conciliarHaberes, fechaDePago, formatConciliacion } from './haberes-conciliacion.mjs'

// Las tres últimas quincenas de "Jornales por Quincena", textuales (leídas el 13/08/2026).
const QUINCENAS = [
  { desde: '2026-07-01', hasta: '2026-07-15', se_paga_el: '2026-07-17', pagado_el: '2026-07-17', banco: 3775150 },
  { desde: '2026-07-16', hasta: '2026-07-31', se_paga_el: '2026-08-03', pagado_el: '2026-08-03', banco: 3336233.42 },
  // La quincena EN CURSO: cierra el 15/08, todavía sin "Pagado el" y con Banco en cero.
  { desde: '2026-08-03', hasta: '2026-08-15', se_paga_el: '2026-08-17', pagado_el: '', banco: 0 },
]

// El comprobante del Santander del 13/08 10:02 — todavía no está en el extracto (generado 08:53).
const NAVARRO = {
  fecha: '2026-08-13', importe: 239790.94, beneficiario: 'NAVARRO MATIAS JESUS',
  cuil: '20399947511', origen: 'comprobante',
}

test('una quincena sin "Pagado el" no reclama ningún pago: manda el hecho, no la previsión', () => {
  assert.equal(fechaDePago(QUINCENAS[1]), '2026-08-03')
  // La en curso cae a la fecha prevista sólo porque no tiene hecho; ver el caso de abajo.
  assert.equal(fechaDePago(QUINCENAS[2]), '2026-08-17')
  assert.equal(fechaDePago({ desde: '2026-08-16' }), null)
})

// ═══ EL DEFECTO CARO ═══
//
// El pago individual del 13/08 NO pertenece a ninguna quincena declarada. Si el emparejamiento fuera
// laxo, se lo llevaría la quincena en curso (prevista para el 17/08) y bastaría marcarle "Pagado el"
// para que `formulaJornalesBancoPosteriores` descargue de la caja la quincena ENTERA — $4.473.400 de
// plata que todavía no salió, por un pago de $239.790,94.
test('un pago individual fuera de toda fecha de pago queda HUÉRFANO, no se cuela en la quincena en curso', () => {
  const r = conciliarHaberes({ pagos: [NAVARRO], quincenas: QUINCENAS, corte: '2026-08-13' })
  assert.equal(r.huerfanos.length, 1)
  assert.equal(r.huerfanos[0].beneficiario, 'NAVARRO MATIAS JESUS')
  assert.ok(r.quincenas.every((q) => q.pagos.length === 0))
  assert.ok(r.avisos.some((a) => /SIN QUINCENA/.test(a)))
})

test('el aviso del huérfano dice explícitamente por qué no se le pone "Pagado el" a la quincena en curso', () => {
  const r = conciliarHaberes({ pagos: [NAVARRO], quincenas: QUINCENAS, corte: '2026-08-13' })
  assert.match(r.avisos.join(' '), /quincena entera/)
})

// EL SALDO INFLADO: el banco confirmó el pago y el extracto todavía no lo muestra. Si esto no se
// declara, la caja del OS afirma tener $239.790,94 que ya no están.
//
// EL CASO EXACTO: extracto generado el 13/08 a las 08:53, pago hecho el 13/08 a las 10:02. MISMO DÍA.
// Con una comparación estricta (`>`), el pago quedaba dado por incluido en un extracto que no lo tiene.
test('un pago confirmado el MISMO día del corte todavía no está en el extracto y se declara', () => {
  const r = conciliarHaberes({ pagos: [NAVARRO], quincenas: QUINCENAS, corte: '2026-08-13' })
  assert.equal(r.anunciados.length, 1)
  assert.ok(r.avisos.some((a) => /POSTERIOR AL CORTE/.test(a)))
})

test('un pago anterior al corte ya está en el extracto: no se reporta', () => {
  const r = conciliarHaberes({ pagos: [{ ...NAVARRO, fecha: '2026-08-12' }], quincenas: QUINCENAS, corte: '2026-08-13' })
  assert.equal(r.anunciados.length, 0)
})

// Un movimiento que SALIÓ del extracto está en el extracto por definición: marcarlo por su fecha en vez
// de por su origen llenaría el informe de avisos falsos el día del corte.
test('un pago que viene del propio extracto nunca se reporta como posterior al corte', () => {
  const r = conciliarHaberes({
    pagos: [{ ...NAVARRO, origen: 'extracto' }], quincenas: QUINCENAS, corte: '2026-08-13',
  })
  assert.equal(r.anunciados.length, 0)
})

// El lote real del 17/07 (260717507): la quincena que cerró el 15/07 cobró dos días después.
const LOTE_17 = [
  { fecha: '2026-07-17', importe: 252200, referencia: 'l1' },
  { fecha: '2026-07-17', importe: 3522950, referencia: 'l2' },
]

test('el lote del banco se imputa a la quincena que declara esa fecha de pago, y cierra', () => {
  const r = conciliarHaberes({ pagos: LOTE_17, quincenas: QUINCENAS })
  const q = r.quincenas.find((x) => x.hasta === '2026-07-15')
  assert.equal(q.pagos.length, 2)
  assert.equal(q.banco_pagado, 3775150)
  assert.equal(q.diferencia, 0)
  assert.equal(r.huerfanos.length, 0)
})

// ═══ EL DEFECTO HISTÓRICO: LA MISMA NÓMINA CONTADA DOS VECES ═══
test('un pago no puede respaldar dos quincenas: se lo lleva la más cercana y una sola', () => {
  // Dos quincenas con fechas de pago a un día de distancia, y un pago en el medio.
  const qs = [
    { desde: '2026-06-16', hasta: '2026-06-30', pagado_el: '2026-07-01', banco: 100 },
    { desde: '2026-07-01', hasta: '2026-07-15', pagado_el: '2026-07-02', banco: 100 },
  ]
  const r = conciliarHaberes({ pagos: [{ fecha: '2026-07-02', importe: 100 }], quincenas: qs })
  const conPago = r.quincenas.filter((q) => q.pagos.length)
  assert.equal(conPago.length, 1)
  assert.equal(conPago[0].hasta, '2026-07-15')
})

// EL EMPATE EXACTO ES DONDE SE CUELA UN CRITERIO OCULTO. Con dos quincenas a la MISMA distancia, si el
// desempate lo decidiera el orden del array, el resultado dependería de cómo vino la lectura del Sheet
// — o sea, de nada. Manda el cierre más reciente: la vieja ya se pagó, la reciente es la que todavía
// puede estar esperando su lote. El fixture está en orden inverso a propósito, para que un desempate
// por posición se vea rojo.
test('ante empate exacto de distancia manda el cierre más reciente, no el orden de la lista', () => {
  const qs = [
    { desde: '2026-07-01', hasta: '2026-07-15', pagado_el: '2026-07-03', banco: 100 },
    { desde: '2026-06-16', hasta: '2026-06-30', pagado_el: '2026-07-01', banco: 100 },
  ]
  const r = conciliarHaberes({ pagos: [{ fecha: '2026-07-02', importe: 100 }], quincenas: qs })
  const conPago = r.quincenas.filter((q) => q.pagos.length)
  assert.equal(conPago.length, 1)
  assert.equal(conPago[0].hasta, '2026-07-15')
})

test('la quincena que declara banco y no tiene respaldo del extracto se reporta con su diferencia', () => {
  const r = conciliarHaberes({
    pagos: [{ fecha: '2026-08-03', importe: 3000000 }],
    quincenas: QUINCENAS,
  })
  const q = r.quincenas.find((x) => x.hasta === '2026-07-31')
  assert.equal(Math.round(q.diferencia * 100), Math.round(336233.42 * 100))
  assert.ok(r.avisos.some((a) => /2026-07-16/.test(a)))
})

test('el informe muestra las quincenas con movimiento y grita los huérfanos', () => {
  const r = conciliarHaberes({ pagos: [NAVARRO, ...LOTE_17], quincenas: QUINCENAS, corte: '2026-08-13' })
  const txt = formatConciliacion(r)
  assert.match(txt, /2026-07-01–2026-07-15/)
  assert.match(txt, /1 pago\(s\) de haberes que ninguna quincena reclama/)
})
