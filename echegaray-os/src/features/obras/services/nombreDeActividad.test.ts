import test from 'node:test'
import assert from 'node:assert/strict'
import { oracionDeActividad } from './nombreDeActividad.ts'

// ═══ EL DEFECTO QUE ATRAPA (24/08/2026 · auditoría 03/07 contra el canónico) ═══
//
// El árbol dibujaba los nombres tal cual vienen de la cotización, en mayúscula sostenida. Estos
// asserts fijan las TRES maneras de arruinar la corrección: tocar lo que una persona ya escribió,
// bajar una designación técnica («H17» → «h17») y devolver TÍTULO en vez de ORACIÓN — que es
// exactamente lo que pasaría si alguien reemplazara esta función por la de `shared/utils/texto`,
// que resuelve nombres propios y no frases.

test('un nombre gritado se lee como oración, no como título', () => {
  assert.equal(oracionDeActividad('HORMIGON DE LIMPIEZA'), 'Hormigon de limpieza')
  assert.equal(oracionDeActividad('PISO DE HORMIGON ALISADO'), 'Piso de hormigon alisado')
  assert.equal(oracionDeActividad('MAMPOSTERÍA LADRILLÓN CERÁMICA'), 'Mampostería ladrillón cerámica')
})

test('lo que ya trae minúsculas NO se toca: quien lo escribió le gana a la función', () => {
  assert.equal(oracionDeActividad('Viga de fundación H17'), 'Viga de fundación H17')
  assert.equal(oracionDeActividad('demolicion con bobcat s650'), 'demolicion con bobcat s650')
  assert.equal(oracionDeActividad('HORMIGON DE LIMPIEZA e = 0,05 m'), 'HORMIGON DE LIMPIEZA e = 0,05 m')
})

test('las designaciones técnicas se conservan: un token con dígitos no es una palabra', () => {
  assert.equal(oracionDeActividad('COLUMNA DE ENCADENADO H17'), 'Columna de encadenado H17')
  assert.equal(oracionDeActividad('BASES AISLADAS CON #8 C/15'), 'Bases aisladas con #8 C/15')
  assert.equal(oracionDeActividad('BLOQUES 18×18'), 'Bloques 18×18')
})

test('una letra sola es un rótulo de sector, no la inicial de una palabra', () => {
  assert.equal(oracionDeActividad('SECTOR A · PABELLÓN AULAS'), 'Sector A · pabellón aulas')
})

test('la mayúscula va a la primera LETRA, no al primer carácter', () => {
  assert.equal(oracionDeActividad('· FRENTE ÚNICO'), '· Frente único')
})

test('vacío y nulo no explotan ni inventan texto', () => {
  assert.equal(oracionDeActividad(''), '')
  assert.equal(oracionDeActividad(null), '')
  assert.equal(oracionDeActividad(undefined), '')
  assert.equal(oracionDeActividad('   '), '   ')
})
