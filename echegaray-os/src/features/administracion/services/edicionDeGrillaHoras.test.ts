// LA REGLA DE QUÉ CELDA SE EDITA, PROBADA FUERA DEL COMPONENTE.
//
// La auditoría del 11/09/2026: la regla vivía adentro de `HorasConPersona.tsx` y ningún test podía
// alcanzarla. Si `=== 1` pasaba a `>= 1`, una corrección se imputaba a un registro elegido en
// silencio y todo seguía verde. Estos casos son los que se ponen rojos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveDeCelda, indiceDeEdicion } from './edicionDeGrillaHoras.ts'

const P1 = 'persona-1'
const P2 = 'persona-2'

const personas = {
  [P1]: {
    registrosDeLaQuincena: [
      { id: 'r-01', fecha: '2026-09-01' },
      { id: 'r-02', fecha: '2026-09-02' },
      // EL DÍA CON DOS REGISTROS: el caso real de la grilla es `licencia + normal`.
      { id: 'r-03a', fecha: '2026-09-03' },
      { id: 'r-03b', fecha: '2026-09-03' },
    ],
  },
  [P2]: { registrosDeLaQuincena: [{ id: 'r-10', fecha: '2026-09-01' }] },
}

test('UN SOLO REGISTRO EN EL DÍA: la celda se corrige, y apunta a ESE registro', () => {
  const i = indiceDeEdicion(personas, { cerrada: false })
  assert.deepEqual(i.get(claveDeCelda(P1, '2026-09-01')), { registroId: 'r-01' })
  assert.deepEqual(i.get(claveDeCelda(P2, '2026-09-01')), { registroId: 'r-10' })
})

test('DOS REGISTROS EN EL MISMO DÍA: NO se ofrece campo — elegir por código es lo prohibido', () => {
  const i = indiceDeEdicion(personas, { cerrada: false })
  assert.equal(i.get(claveDeCelda(P1, '2026-09-03')), undefined,
    'con dos registros el campo tendría que elegir en silencio a cuál imputar la corrección')
  // El defecto que atrapa: `>= 1`, o «agarrá el primero». Con cualquiera de los dos, esto cae.
  assert.equal(i.size, 3, 'sólo los días con UN registro entran al índice')
})

test('UN DÍA SIN REGISTROS NO ESTÁ EN EL ÍNDICE: no hay nada que corregir', () => {
  const i = indiceDeEdicion(personas, { cerrada: false })
  assert.equal(i.get(claveDeCelda(P1, '2026-09-09')), undefined)
})

test('QUINCENA CERRADA: ninguna celda se ofrece, aunque los días tengan un solo registro', () => {
  const i = indiceDeEdicion(personas, { cerrada: true })
  assert.equal(i.size, 0, 'las horas selladas no se editan: la acción además lo rebota en el servidor')
})

test('LA CLAVE NO SE ARMA A MANO EN DOS LADOS', () => {
  // El defecto que atrapa: consultar con `${persona}-${fecha}` mientras el índice usa `|`. El índice
  // queda lleno y la grilla no ofrece un solo campo — sin error, sin rojo, sin nada.
  assert.equal(claveDeCelda('a', 'b'), 'a|b')
})
