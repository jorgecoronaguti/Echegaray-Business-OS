// LA TARIFA ESCRITA SE LEE EN ES-AR (auditoría del deshacer, 18/09/2026).
//
// El lector viejo borraba TODOS los puntos: una tarifa decimal escrita con punto salía multiplicada («5400.5» →
// 54.005, «8.5» → 85). Estos casos dan rojo con ese código y pasan con `leerNumeroEsAR`, el lector único.
import test from 'node:test'
import assert from 'node:assert/strict'
import { validarTarifa } from './liquidacionTarifa.ts'

const tarifa = (valorHora: string | null, netoMensual: string | null = null) =>
  validarTarifa({ valorHora, netoMensual, desde: '2026-09-01', origen: 'acuerdo con el dueño' })

test('UN PUNTO DECIMAL NO MULTIPLICA EL $/H: «5400.5» es 5.400,5 y «8.5» es 8,5', () => {
  const r = tarifa('5400.5')
  assert.equal(r.ok && r.tarifa.valorHora, 5400.5, 'MUTACIÓN: borrar los puntos da 54.005')
  const chico = tarifa('8.5')
  assert.equal(chico.ok && chico.tarifa.valorHora, 8.5, 'MUTACIÓN: «8.5» leído 85')
})

test('MILES CON PUNTO Y CENTAVOS CON COMA, COMO SE ESCRIBEN EN LA EMPRESA', () => {
  assert.equal((tarifa('5.400') as { tarifa: { valorHora: number } }).tarifa.valorHora, 5400)
  assert.equal((tarifa('$ 5.400,50') as { tarifa: { valorHora: number } }).tarifa.valorHora, 5400.5)
  assert.equal((tarifa(null, '1.800.000') as { tarifa: { netoMensual: number } }).tarifa.netoMensual, 1800000)
})

test('LO AMBIGUO O LO QUE NO ES NÚMERO SE RECHAZA, NO SE ADIVINA', () => {
  for (const malo of ['5.4.0', '54oo', '5.400,5,0']) {
    const r = tarifa(malo)
    assert.equal(r.ok, false, `«${malo}» no es una tarifa`)
    assert.match(!r.ok ? r.error : '', /no es un número/)
  }
})
