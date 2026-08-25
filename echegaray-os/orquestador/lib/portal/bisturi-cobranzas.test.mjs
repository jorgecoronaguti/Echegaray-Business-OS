// Cada test de acá es una forma de romper el Flujo de Caja de verdad: escribir en la fila corrida,
// dejar el IVA del importe viejo, borrar la nota del dueño, o meter una fecha ambigua.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLUMNA, serialDeFecha, fechaDeSerial, formulaNetoDesdeBruto, verificarHuella,
  puedeEscribirMonto, notaApendada, planificarEscritura,
} from './bisturi-cobranzas.mjs'

const HUELLA = { huella_comprobante: '01-000048', huella_monto: 9520000 }
const LEIDO = { comprobante: '01-000048', monto_neto: 9520000, nota: null }
// Fila 5 tal como está en el Sheet real: M deriva de J+K-L y K es un LITERAL.
const F5_REAL = { K: '1999200', M: '=J5+K5-L5' }
// Fila 49 real: K sí es fórmula sobre J.
const F49_SANA = { K: '=J49*0,21', M: '=J49+K49-L49' }

test('las columnas son las que se leyeron del Sheet vivo, no las del contrato', () => {
  assert.deepEqual({ ...COLUMNA }, { monto: 'J', medio: 'N', estado_cobrado: 'O', fecha: 'Q', nota: 'W' })
})

test('la fecha va como serial y coincide con lo que el Sheet ya tiene guardado', () => {
  assert.equal(serialDeFecha('2026-02-03'), 46056)   // fila 5 del Sheet real
  assert.equal(serialDeFecha('2026-01-06'), 46028)   // columna P de la fila 5
  assert.equal(fechaDeSerial(46056), '2026-02-03')
})

test('una fecha ilegible NO produce un serial: escribiría un número cualquiera en la palanca', () => {
  for (const malo of [null, '', 'ayer', '32/13/2026']) assert.equal(serialDeFecha(malo), null)
})

test('el neto desde el bruto es aritmética ENTERA: ni una coma decimal dentro del paréntesis', () => {
  const f = formulaNetoDesdeBruto(10000000)
  assert.equal(f, '=10000000*100/121')
  assert.ok(!/,/.test(f), 'una coma decimal rompe la fórmula fuera de es-AR')
  // Y da lo mismo que el `=10000000/1,21` que ya vive en la fila 48.
  assert.ok(Math.abs(10000000 * 100 / 121 - 10000000 / 1.21) < 1e-6)
  assert.equal(formulaNetoDesdeBruto(5000, 105), '=5000*100/205')
  assert.equal(formulaNetoDesdeBruto('x'), null)
})

test('si el comprobante de la fila no es el que se vio al encolar, NO se escribe', () => {
  // Esto es exactamente lo que pasa cuando alguien inserta una fila y todo se corre.
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

test('NO se escribe J cuando K es un número pegado: el IVA quedaría del importe viejo', () => {
  const r = puedeEscribirMonto(F5_REAL, 5)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'iva_literal')
  assert.match(r.detalle, /K5/)
})

test('sí se escribe J cuando K es la fórmula que sigue a J', () => {
  assert.equal(puedeEscribirMonto(F49_SANA, 49).ok, true)
})

test('una fila sin IVA (K vacío) deja escribir J: J y M cierran solos', () => {
  assert.equal(puedeEscribirMonto({ K: '', M: '=J50+K50-L50' }, 50).ok, true)
})

test('si M NO deriva de J+K-L, no se toca J: el total no seguiría al importe', () => {
  const r = puedeEscribirMonto({ K: '=J50*0,21', M: '16200000' }, 50)
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

test('registrar un cobro escribe la fecha en Q como serial y apenda la traza en W', () => {
  const { celdas, rechazo } = planificarEscritura({
    fila: 49, cambio: { ...HUELLA, campo: 'fecha', valor_nuevo: '2026-02-03' },
    leido: { ...LEIDO, nota: 'nota vieja' }, formulas: F49_SANA, nota: 'OS: cobrado',
  })
  assert.equal(rechazo, null)
  assert.deepEqual(celdas[0], { rango: 'Cobranzas!Q49', valor: 46056 })
  assert.equal(celdas[1].rango, 'Cobranzas!W49')
  assert.equal(celdas[1].valor, 'nota vieja\nOS: cobrado')
  assert.equal(celdas.length, 2, 'sólo Q y W: ninguna otra celda se toca')
})

test('el estado se escribe con el rótulo EXACTO que leen las fórmulas de U y V', () => {
  const { celdas } = planificarEscritura({
    fila: 49, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO, formulas: F49_SANA,
  })
  assert.deepEqual(celdas, [{ rango: 'Cobranzas!O49', valor: 'Cobrado' }])
})

test('el medio se traduce al vocabulario que la columna N ya usa', () => {
  const plan = (v) => planificarEscritura({
    fila: 49, cambio: { ...HUELLA, campo: 'medio', valor_nuevo: v }, leido: LEIDO, formulas: F49_SANA,
  })
  assert.deepEqual(plan('transferencia').celdas, [{ rango: 'Cobranzas!N49', valor: 'Transferencia' }])
  assert.deepEqual(plan('cheque').celdas, [{ rango: 'Cobranzas!N49', valor: 'Echeq' }])
  assert.equal(plan('bitcoin').rechazo.motivo, 'valor_invalido')
})

test('un plan rechazado NO trae ninguna celda: no hay escritura parcial', () => {
  const r = planificarEscritura({
    fila: 5, cambio: { ...HUELLA, campo: 'monto', valor_nuevo: '9000000' },
    leido: LEIDO, formulas: F5_REAL, nota: 'traza',
  })
  assert.equal(r.rechazo.motivo, 'iva_literal')
  assert.deepEqual(r.celdas, [], 'ni siquiera la nota se escribe si el cambio no se aplica')
})

test('nunca se escribe por encima de la fila 5: ahí vive el encabezado', () => {
  for (const f of [4, 1, 0, -1, 2.5]) {
    const r = planificarEscritura({ fila: f, cambio: { ...HUELLA, campo: 'estado_cobrado' }, leido: LEIDO })
    assert.equal(r.rechazo.motivo, 'fila_invalida', `la fila ${f} tiene que rebotar`)
  }
})

test('un campo sin celda asignada rebota en vez de adivinar dónde escribir', () => {
  const r = planificarEscritura({
    fila: 49, cambio: { ...HUELLA, campo: 'retenciones', valor_nuevo: '5' }, leido: LEIDO, formulas: F49_SANA,
  })
  assert.equal(r.rechazo.motivo, 'campo_desconocido')
})

test('ninguna celda planificada cae fuera de las cinco columnas permitidas', () => {
  const campos = [['fecha', '2026-09-01'], ['medio', 'efectivo'], ['estado_cobrado', null]]
  const permitidas = new Set(['J', 'N', 'O', 'Q', 'W'])
  for (const [campo, valor_nuevo] of campos) {
    const { celdas } = planificarEscritura({
      fila: 49, cambio: { ...HUELLA, campo, valor_nuevo }, leido: LEIDO, formulas: F49_SANA, nota: 't',
    })
    for (const c of celdas) {
      assert.ok(permitidas.has(c.rango.replace(/^Cobranzas!([A-Z]+)\d+$/, '$1')), `${c.rango} está fuera del bisturí`)
    }
  }
})
