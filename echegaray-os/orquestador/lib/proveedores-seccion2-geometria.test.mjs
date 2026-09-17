import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { geometriaDeConcentracion } from './proveedores-seccion2-geometria.mjs'

/** Una pestaña con `celdas` = {fila base 1: texto de A}. */
const pestana = (celdas, alto = 125) => Array.from({ length: alto }, (_, i) => (celdas[i + 1] === undefined ? [] : [celdas[i + 1]]))

/** La geometría VIEJA, copiada del script antes del arreglo: la regex /PROVEEDOR/ bajo el título. */
function geometriaVieja(filas) {
  const i2 = filas.findIndex((f) => String(f?.[0] ?? '').includes('CON QUIÉN SE GASTA'))
  const lim = filas.findIndex((f, i) => i > i2 && /^\d+ · /.test(String(f?.[0] ?? '')))
  const iCab = filas.findIndex((f, i) => i > i2 && i < lim && /PROVEEDOR/i.test(String(f?.[0] ?? '')))
  return iCab < 0 ? null : iCab + 1
}

describe('geometriaDeConcentracion', () => {
  it('EL ESTADO DEL 17/09: tres dinámicas en #REF! apiladas — los rótulos son los del título, y se limpia todo hasta la 4', () => {
    const filas = pestana({ 105: '3 · CON QUIÉN SE GASTA', 106: '#REF!', 108: '#REF!', 110: '#REF!', 115: '4 · RESPALDO FISCAL — contra el libro de IVA de ARCA' })
    assert.deepEqual(geometriaDeConcentracion(filas), { filaTitulo: 105, filaRotulos: 106, filaLimite: 115 })
  })

  it('EL MECANISMO: con la dinámica en #REF!, la regex vieja caía sobre el pie y dejaba la de arriba viva', () => {
    const filas = pestana({ 105: '3 · CON QUIÉN SE GASTA', 106: '#REF!', 108: 'Resto de proveedores comerciales (126)',
      109: 'TOTAL COMPRADO A PROVEEDORES COMERCIALES', 115: '4 · RESPALDO FISCAL' })
    assert.equal(geometriaVieja(filas), 108, 'la fixture tiene que reproducir el defecto')
    assert.equal(geometriaDeConcentracion(filas).filaRotulos, 106)
  })

  it('sana: rótulos debajo del título, igual que antes', () => {
    const filas = pestana({ 60: '3 · CON QUIÉN SE GASTA', 61: 'Proveedor', 62: 'Alumetal', 115: '4 · RESPALDO FISCAL' })
    assert.deepEqual(geometriaDeConcentracion(filas), { filaTitulo: 60, filaRotulos: 61, filaLimite: 115 })
  })

  it('última sección: el límite es el fin del contenido; sin nada debajo, no escribe', () => {
    assert.equal(geometriaDeConcentracion(pestana({ 60: '3 · CON QUIÉN SE GASTA', 61: 'Proveedor', 70: 'TOTAL' })).filaLimite, 71)
    assert.throws(() => geometriaDeConcentracion(pestana({ 60: '3 · CON QUIÉN SE GASTA' })), /no tiene ni una fila debajo/)
  })

  it('sin título no adivina; con la sección siguiente pegada al título, no escribe', () => {
    assert.throws(() => geometriaDeConcentracion(pestana({ 61: 'Proveedor' })), /no encontré el título/)
    assert.throws(() => geometriaDeConcentracion(pestana({ 60: '3 · CON QUIÉN SE GASTA', 61: '4 · RESPALDO FISCAL' })), /cae en la sección siguiente/)
  })
})
