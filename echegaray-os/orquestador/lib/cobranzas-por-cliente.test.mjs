import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_CUADRO, filaCliente, formulaClientes, diagnosticarRango, FIN } from './cobranzas-por-cliente.mjs'
import { columnasCobranzas } from './cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

const cols = { facturado: '$AF', cobrado: '$AG' }
const COB = columnasCobranzas(COBRANZAS_1409, COLUMNAS_CUADRO)
const COB_OBRA = columnasCobranzas(COBRANZAS_CON_OBRA, COLUMNAS_CUADRO)

test('"cobrado" se define por el ESTADO, no por tener fecha', () => {
  // El defecto que hacía que PENDIENTE fuera $0 con $118M sin cobrar: una proyección también tiene
  // fecha de cobro, porque es la fecha en que se espera cobrar.
  const f = filaCliente('$AC65', '$AF$90', cols, 65, COB)
  assert.match(f.cobrado, /"Cobrado"/)
  assert.doesNotMatch(f.cobrado, /ISNUMBER\(\$Q/)
})

test('las columnas de Cobranzas salen del rótulo: G/M/O hoy, G/N/P con «Obra» insertada en H', () => {
  const antes = filaCliente('$AC65', '$AF$90', cols, 65, COB)
  assert.equal(antes.facturado, '=SUMIF($G$5:$G$400;$AC65;$M$5:$M$400)', 'antes de la inserción, la fórmula de hoy al carácter')
  assert.equal(antes.cobrado, '=SUMIFS($M$5:$M$400;$G$5:$G$400;$AC65;$O$5:$O$400;"Cobrado")')
  const despues = filaCliente('$AD65', '$AG$90', { facturado: '$AG', cobrado: '$AH' }, 65, COB_OBRA)
  assert.equal(despues.cobrado, '=SUMIFS($N$5:$N$400;$G$5:$G$400;$AD65;$P$5:$P$400;"Cobrado")')
  assert.equal(COBRANZAS_CON_OBRA[13], 'TOTAL a cobrar (neto de retenciones)')
  assert.equal(COBRANZAS_CON_OBRA[15], 'Estado')
  assert.equal(formulaClientes(COB_OBRA), '=IFERROR(SORT(UNIQUE(FILTER($G$5:$G$400;$G$5:$G$400<>"")));"")')
})

test('sin las columnas resueltas no hay fórmula: no existe una letra por defecto', () => {
  assert.throws(() => filaCliente('$AC65', '$AF$90', cols, 65), /faltan columnas de Cobranzas/)
  assert.throws(() => formulaClientes(), /faltan columnas de Cobranzas/)
})

test('todas las fórmulas leen hasta la misma fila que el resto del archivo', () => {
  const f = filaCliente('$AC65', '$AF$90', cols, 65, COB)
  for (const [k, v] of Object.entries(f)) {
    if (k === 'pendiente' || k === 'porcentaje') continue
    assert.match(v, new RegExp(`\\$${FIN}\\b`), `${k} no llega hasta la fila ${FIN}`)
  }
})

test('la lista de clientes es viva: un cliente nuevo aparece solo', () => {
  const f = formulaClientes(COB)
  assert.match(f, /UNIQUE/)
  assert.match(f, new RegExp(`\\$${FIN}`))
})

test('las fórmulas van en es-AR', () => {
  const f = filaCliente('$AC65', '$AF$90', cols, 65, COB)
  for (const v of Object.values(f)) {
    // La única coma admitida es la de un patrón de TEXT, que no lleva ninguna.
    assert.ok(!v.includes(','), `una coma rompe la fórmula en es-AR: ${v}`)
  }
})

test('detecta el rango fosilizado — el defecto que dejó $4.435.450 afuera', () => {
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
