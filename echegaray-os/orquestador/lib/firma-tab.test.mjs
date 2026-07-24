import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firmaDeGrid, humanoEdito, evaluarFirma } from './firma-tab.mjs'

test('la misma grilla da la misma firma (estable)', () => {
  const g = [['Semana', 'Cobros'], ['1', '=SUM(A1:A5)']]
  assert.equal(firmaDeGrid(g), firmaDeGrid(g.map((f) => [...f])))
})

test('un cambio de una persona (texto o fórmula) cambia la firma', () => {
  const base = [['Semana', 'Cobros'], ['1', '=SUM(A1:A5)']]
  const editaTexto = [['Semana', 'Cobranzas'], ['1', '=SUM(A1:A5)']] // cambió un rótulo
  const editaFormula = [['Semana', 'Cobros'], ['1', '=SUM(A1:A9)']]  // cambió una fórmula
  assert.notEqual(firmaDeGrid(base), firmaDeGrid(editaTexto))
  assert.notEqual(firmaDeGrid(base), firmaDeGrid(editaFormula))
})

test('filas vacías al final NO cambian la firma (Google recorta/agrega filas vacías)', () => {
  const a = [['x', 'y'], ['1', '2']]
  const b = [['x', 'y'], ['1', '2'], ['', ''], ['']]
  assert.equal(firmaDeGrid(a), firmaDeGrid(b))
})

test('el trim de celdas no cambia la firma (espacios de más del ida y vuelta)', () => {
  const a = [['Semana', 'Cobros']]
  const b = [['Semana ', ' Cobros']]
  assert.equal(firmaDeGrid(a), firmaDeGrid(b))
})

test('humanoEdito: sin baseline no se puede afirmar que editó', () => {
  assert.deepEqual(humanoEdito('abc', null), { editado: false, hayBaseline: false })
})

test('humanoEdito: con baseline, mismatch = editó; match = no editó', () => {
  assert.deepEqual(humanoEdito('abc', 'abc'), { editado: false, hayBaseline: true })
  assert.deepEqual(humanoEdito('xyz', 'abc'), { editado: true, hayBaseline: true })
})

// ═══ evaluarFirma: la decisión, con el ARRANQUE EN FRÍO resuelto del lado SEGURO (24/07) ═══
// El defecto que el dueño sufrió por enésima vez: sin baseline, el OS escribía encima de su edición.
// Ahora sin baseline se falla CERRADO usando el historial de Drive.

test('evaluarFirma: con baseline que coincide → NO editada (el OS puede escribir)', () => {
  assert.deepEqual(
    evaluarFirma({ firmaActual: 'abc', firmaGuardada: 'abc' }),
    { editada: false, motivo: 'coincide con mi última escritura' },
  )
})

test('evaluarFirma: con baseline que difiere → editada (la tomo como tuya)', () => {
  const r = evaluarFirma({ firmaActual: 'xyz', firmaGuardada: 'abc' })
  assert.equal(r.editada, true)
})

test('EL ARREGLO: sin baseline + una persona tocó el archivo → editada (NO se pisa)', () => {
  // Antes esto devolvía editado:false y el generador escribía encima. Ahora falla cerrado.
  const r = evaluarFirma({ firmaActual: 'lo-que-sea', firmaGuardada: null, hayEdicionHumana: true })
  assert.equal(r.editada, true)
})

test('sin baseline y SÓLO el OS tocó el archivo → NO editada (se adopta y se sella, no bloquea)', () => {
  // El caso legítimo: una pestaña derivada que el OS mantiene y nadie más tocó. No se auto-canda:
  // se escribe normal y se establece la firma. Así la autonomía no se rompe cuando no hay riesgo.
  const r = evaluarFirma({ firmaActual: 'lo-que-sea', firmaGuardada: null, hayEdicionHumana: false })
  assert.equal(r.editada, false)
})
