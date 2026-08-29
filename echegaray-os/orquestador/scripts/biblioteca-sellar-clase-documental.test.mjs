// SELLAR LA CLASE ES DEDUCIR, NO INVENTAR — y tiene que poder no cambiar nada.
//
// El riesgo de un script que reescribe la biblioteca no es que falle: es que "arregle" de más. Estos
// tests fijan las dos mitades: qué SE sella y qué NO se toca.
import test from 'node:test'
import assert from 'node:assert/strict'
import { selloDe } from './biblioteca-sellar-clase-documental.mjs'

const k = (clave, archivo, confianza = 'MEDIA', clase = undefined) => ({
  clave, confianza, evidencia: { archivo, ...(clase ? { clase } : {}) },
})

test('una frase de un borrador propio baja a BAJA y queda marcada NOTA_INTERNA', () => {
  const r = selloDe(k('documento-proyecto.charlar-de-diagrama-de-gant.criterio_tecnico.1', 'Charlar de diagrama de GANT.docx'))
  assert.deepEqual(r, { clase: 'NOTA_INTERNA', confianza: 'BAJA' })
})

test('la del contrato se marca, pero su confianza NO se toca', () => {
  const r = selloDe(k('documento-proyecto.contrato-de-obra.exclusion.2', 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx'))
  assert.deepEqual(r, { clase: 'MEMORIA', confianza: 'MEDIA' })
})

test('es idempotente: lo ya sellado devuelve null y no se reescribe', () => {
  assert.equal(selloDe(k('documento-proyecto.x.exclusion.1', 'Charlar de diagrama de GANT.docx', 'BAJA', 'NOTA_INTERNA')), null)
})

test('no toca nada que no venga de un documento de proyecto ni nada sin archivo', () => {
  assert.equal(selloDe(k('cotizacion_cliente.cierre.beneficio', 'ARSJ Planilla.xlsx')), null)
  assert.equal(selloDe({ clave: 'documento-proyecto.x.alcance.1', confianza: 'MEDIA', evidencia: {} }), null)
  assert.equal(selloDe(undefined), null)
})
