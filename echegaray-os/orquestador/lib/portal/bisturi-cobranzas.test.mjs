// Cada test de acá es una forma de romper el Flujo de Caja de verdad: escribir en la fila corrida,
// dejar el IVA del importe viejo, borrar la nota del dueño, o meter una fecha ambigua — o escribir en
// la columna de al lado porque alguien insertó «Obra» en H.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPO_A_COLUMNA, COLUMNAS_BISTURI, serialDeFecha, fechaDeSerial, formulaNetoDesdeBruto, verificarHuella,
  puedeEscribirMonto, notaApendada, planificarEscritura,
} from './bisturi-cobranzas.mjs'
import { columnasCobranzas } from '../cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from '../encabezados-referencia.mjs'

const COLS = columnasCobranzas(COBRANZAS_1409, COLUMNAS_BISTURI)
const COLS_OBRA = columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_BISTURI)
const HUELLA = { huella_comprobante: '01-000048', huella_monto: 9520000 }
const LEIDO = { comprobante: '01-000048', monto_neto: 9520000, nota: null }
// Fila 5 tal como está en el Sheet real: el total deriva de J+K-L y el IVA (K) es un LITERAL.
const F5_REAL = { iva: '1999200', total: '=J5+K5-L5' }
// Fila 49 real: el IVA sí es fórmula sobre el neto.
const F49_SANA = { iva: '=J49*0,21', total: '=J49+K49-L49' }
// La misma fila 49 después de insertar «Obra» en H: Google corrió las referencias una letra.
const F49_OBRA = { iva: '=K49*0,21', total: '=K49+L49-M49' }

/** La letra de una celda planificada. */
const letraDe = (rango) => rango.replace(/^Cobranzas!([A-Z]+)\d+$/, '$1')
/** El rótulo que hay en esa letra, en el encabezado dado. */
const rotuloEn = (encabezado, rango) => {
  const l = letraDe(rango)
  const i = [...l].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1
  return encabezado[i]
}

test('cada campo va a una columna declarada por rótulo, no por letra', () => {
  assert.deepEqual({ ...CAMPO_A_COLUMNA }, { monto: 'neto', medio: 'formaCobro', estado_cobrado: 'estado', fecha: 'fechaCobro', nota: 'notas' })
})

test('la fecha va como serial y coincide con lo que el Sheet ya tiene guardado', () => {
  assert.equal(serialDeFecha('2026-02-03'), 46056)   // fila 5 del Sheet real
  assert.equal(serialDeFecha('2026-01-06'), 46028)   // «Fecha de Factura» de la fila 5
  assert.equal(fechaDeSerial(46056), '2026-02-03')
})

test('una fecha ilegible NO produce un serial: escribiría un número cualquiera en la palanca', () => {
  for (const malo of [null, '', 'ayer', '32/13/2026']) assert.equal(serialDeFecha(malo), null)
})

test('el neto desde el bruto es aritmética ENTERA: ni una coma decimal dentro del paréntesis', () => {
  const f = formulaNetoDesdeBruto(10000000)
  assert.equal(f, '=10000000*100/121')
  assert.ok(!/,/.test(f), 'una coma decimal rompe la fórmula fuera de es-AR')
  assert.ok(Math.abs(10000000 * 100 / 121 - 10000000 / 1.21) < 1e-6)
  assert.equal(formulaNetoDesdeBruto(5000, 105), '=5000*100/205')
  assert.equal(formulaNetoDesdeBruto('x'), null)
})

test('si el comprobante de la fila no es el que se vio al encolar, NO se escribe', () => {
  const r = verificarHuella({ comprobante: '01-000049', monto_neto: 9520000 }, HUELLA)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'huella_distinta')
  assert.match(r.detalle, /01-000049/)
})

test('un cambio encolado sin huella no se aplica: no hay con qué verificar la fila', () => {
  const r = verificarHuella(LEIDO, { huella_comprobante: null, huella_monto: null })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'sin_huella')
})

test('un peso de diferencia en el neto no rompe la huella; mil sí', () => {
  assert.equal(verificarHuella({ comprobante: '01-000048', monto_neto: 9519999.6 }, HUELLA).ok, true)
  assert.equal(verificarHuella({ comprobante: '01-000048', monto_neto: 9521000 }, HUELLA).ok, false)
})

test('NO se escribe el neto cuando el IVA es un número pegado: quedaría del importe viejo', () => {
  const r = puedeEscribirMonto(F5_REAL, 5, COLS)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'iva_literal')
  assert.match(r.detalle, /K5/)
})

test('sí se escribe el neto cuando el IVA es la fórmula que lo sigue — antes y después de «Obra»', () => {
  assert.equal(puedeEscribirMonto(F49_SANA, 49, COLS).ok, true)
  assert.equal(puedeEscribirMonto(F49_OBRA, 49, COLS_OBRA).ok, true)
})

test('después de «Obra», la aritmética vieja J+K-L ya NO es la del total: se rechaza', () => {
  // Con la letra fija, `=J49+K49-L49` (OC… no: Concepto + Monto neto − IVA) habría pasado el portón.
  const r = puedeEscribirMonto(F49_SANA, 49, COLS_OBRA)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'total_no_deriva')
  assert.match(r.detalle, /N49 no es «=K49\+L49-M49»/)
})

test('una fila sin IVA deja escribir el neto: neto y total cierran solos', () => {
  assert.equal(puedeEscribirMonto({ iva: '', total: '=J50+K50-L50' }, 50, COLS).ok, true)
})

test('si el total NO deriva de neto+IVA-retenciones, no se toca el neto', () => {
  const r = puedeEscribirMonto({ iva: '=J50*0,21', total: '16200000' }, 50, COLS)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'total_no_deriva')
})

test('la nota del dueño se conserva y la traza se agrega debajo — nunca se pisa', () => {
  const previa = 'Cargado en ECUP. DECISIÓN: ESPERAR al cobro (21/8)'
  const r = notaApendada(previa, 'OS 25/08: cobro registrado desde la app')
  assert.ok(r.startsWith(previa), 'lo que escribió el dueño va primero y entero')
  assert.equal(r.split('\n').length, 2)
  assert.equal(notaApendada(null, 'x'), 'x')
  assert.equal(notaApendada('  ', null), null)
})

test('registrar un cobro escribe la fecha como serial y apenda la traza — Q/W antes, R/X después', () => {
  for (const [enc, cols, formulas, fecha, nota] of [
    [COBRANZAS_1409, COLS, F49_SANA, 'Cobranzas!Q49', 'Cobranzas!W49'],
    [COBRANZAS_CON_OBRA, COLS_OBRA, F49_OBRA, 'Cobranzas!R49', 'Cobranzas!X49'],
  ]) {
    const { celdas, rechazo } = planificarEscritura({
      fila: 49, cambio: { ...HUELLA, campo: 'fecha', valor_nuevo: '2026-02-03' },
      leido: { ...LEIDO, nota: 'nota vieja' }, formulas, nota: 'OS: cobrado', cols,
    })
    assert.equal(rechazo, null)
    assert.deepEqual(celdas[0], { rango: fecha, valor: 46056 })
    assert.equal(rotuloEn(enc, celdas[0].rango), 'Fecha cobro')
    assert.equal(celdas[1].rango, nota)
    assert.equal(rotuloEn(enc, celdas[1].rango), 'Notas')
    assert.equal(celdas[1].valor, 'nota vieja\nOS: cobrado')
    assert.equal(celdas.length, 2, 'sólo la fecha y la nota: ninguna otra celda se toca')
  }
})

test('estado, medio y monto caen en su rótulo antes y después de insertar «Obra»', () => {
  for (const [enc, cols, formulas] of [[COBRANZAS_1409, COLS, F49_SANA], [COBRANZAS_CON_OBRA, COLS_OBRA, F49_OBRA]]) {
    const plan = (campo, valor_nuevo) => planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo, valor_nuevo }, leido: LEIDO, formulas, cols })
    const estado = plan('estado_cobrado').celdas
    assert.deepEqual(estado.map((c) => c.valor), ['Cobrado'])
    assert.equal(rotuloEn(enc, estado[0].rango), 'Estado')
    assert.equal(rotuloEn(enc, plan('medio', 'cheque').celdas[0].rango), 'Forma de Cobro')
    assert.equal(plan('medio', 'cheque').celdas[0].valor, 'Echeq')
    assert.equal(rotuloEn(enc, plan('monto', '9000000').celdas[0].rango), 'Monto neto')
  }
  assert.equal(planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO, cols: COLS }).celdas[0].rango, 'Cobranzas!O49')
  assert.equal(planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO, cols: COLS_OBRA }).celdas[0].rango, 'Cobranzas!P49')
})

test('el medio se traduce al vocabulario que la columna ya usa, y lo desconocido rebota', () => {
  const plan = (v) => planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo: 'medio', valor_nuevo: v }, leido: LEIDO, formulas: F49_SANA, cols: COLS })
  assert.deepEqual(plan('transferencia').celdas, [{ rango: 'Cobranzas!N49', valor: 'Transferencia' }])
  assert.equal(plan('bitcoin').rechazo.motivo, 'valor_invalido')
})

test('sin las columnas resueltas no hay plan: no existe una letra por defecto', () => {
  assert.throws(() => planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO }), /faltan columnas de Cobranzas/)
  assert.throws(() => columnasCobranzas(COBRANZAS_1409.map((r) => (r === 'Notas' ? 'Observaciones' : r)), COLUMNAS_BISTURI), /falta la columna «Notas»/)
})

test('un plan rechazado NO trae ninguna celda: no hay escritura parcial', () => {
  const r = planificarEscritura({
    fila: 5, cambio: { ...HUELLA, campo: 'monto', valor_nuevo: '9000000' },
    leido: LEIDO, formulas: F5_REAL, nota: 'traza', cols: COLS,
  })
  assert.equal(r.rechazo.motivo, 'iva_literal')
  assert.deepEqual(r.celdas, [], 'ni siquiera la nota se escribe si el cambio no se aplica')
})

test('nunca se escribe por encima de la fila 5: ahí vive el encabezado', () => {
  for (const f of [4, 1, 0, -1, 2.5]) {
    const r = planificarEscritura({ fila: f, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO, cols: COLS })
    assert.equal(r.rechazo.motivo, 'fila_invalida', `la fila ${f} tiene que rebotar`)
  }
})

test('un campo sin celda asignada rebota en vez de adivinar dónde escribir', () => {
  const r = planificarEscritura({
    fila: 49, cambio: { ...HUELLA, campo: 'retenciones', valor_nuevo: '5' }, leido: LEIDO, formulas: F49_SANA, cols: COLS,
  })
  assert.equal(r.rechazo.motivo, 'campo_desconocido')
})

test('ninguna celda planificada cae fuera de las cinco columnas permitidas, en los dos layouts', () => {
  const campos = [['fecha', '2026-09-01'], ['medio', 'efectivo'], ['estado_cobrado', null], ['monto', '1']]
  for (const [enc, cols, formulas] of [[COBRANZAS_1409, COLS, F49_SANA], [COBRANZAS_CON_OBRA, COLS_OBRA, F49_OBRA]]) {
    const permitidas = new Set(['Monto neto', 'Forma de Cobro', 'Estado', 'Fecha cobro', 'Notas'])
    for (const [campo, valor_nuevo] of campos) {
      const { celdas } = planificarEscritura({ fila: 49, cambio: { ...HUELLA, campo, valor_nuevo }, leido: LEIDO, formulas, nota: 't', cols })
      for (const c of celdas) assert.ok(permitidas.has(rotuloEn(enc, c.rango)), `${c.rango} está fuera del bisturí`)
    }
  }
})
