import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filaCliente, formulaClientes, diagnosticarRango, FIN } from './cobranzas-por-cliente.mjs'

const cols = { facturado: '$AF', cobrado: '$AG' }

test('"cobrado" se define por el ESTADO, no por tener fecha', () => {
  // El defecto que hacía que PENDIENTE fuera $0 con $118M sin cobrar: una proyección también tiene
  // fecha de cobro, porque es la fecha en que se espera cobrar.
  const f = filaCliente('$AC65', '$AF$90', cols, 65)
  assert.match(f.cobrado, /"Cobrado"/)
  assert.doesNotMatch(f.cobrado, /ISNUMBER\(\$Q/)
})

test('todas las fórmulas leen hasta la misma fila que el resto del archivo', () => {
  const f = filaCliente('$AC65', '$AF$90', cols, 65)
  for (const [k, v] of Object.entries(f)) {
    if (k === 'pendiente' || k === 'porcentaje') continue
    assert.match(v, new RegExp(`\\$${FIN}\\b`), `${k} no llega hasta la fila ${FIN}`)
  }
})

test('la lista de clientes es viva: un cliente nuevo aparece solo', () => {
  const f = formulaClientes()
  assert.match(f, /UNIQUE/)
  assert.match(f, new RegExp(`\\$${FIN}`))
})

test('las fórmulas van en es-AR', () => {
  const f = filaCliente('$AC65', '$AF$90', cols, 65)
  for (const v of Object.values(f)) {
    // La única coma admitida es la de un patrón de TEXT, que no lleva ninguna.
    assert.ok(!v.includes(','), `una coma rompe la fórmula en es-AR: ${v}`)
  }
})

test('detecta el rango fosilizado — el defecto que dejó $4.435.450 afuera', () => {
  // El caso real: el cuadro leía hasta la 58 y había datos hasta la 60.
  const d = diagnosticarRango(58, 60)
  assert.equal(d.fosilizado, true)
  assert.equal(d.perdidas, 2)
})

test('avisa cuando el rango todavía alcanza pero está por quedarse corto', () => {
  const d = diagnosticarRango(80, 60)
  assert.equal(d.fosilizado, false)
  assert.equal(d.sinMargen, true)
})

test('un rango con aire de sobra no reporta nada', () => {
  const d = diagnosticarRango(400, 60)
  assert.equal(d.fosilizado, false)
  assert.equal(d.sinMargen, false)
})
