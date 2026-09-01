// POR QUÉ HIZO FALTA EL RAZONADOR. Cada test prueba un DEFECTO: revertir el arreglo pone uno rojo.
//
// El defecto de origen: de las 10 escalaciones medidas el 27–28/08, NUEVE no tenían una sola línea
// que dijera por qué no las pudo resolver una tool. Sin eso no se puede distinguir «esto había que
// pensarlo» de «falta una capacidad», que es la única distinción que hace bajar el número.
import test from 'node:test'
import assert from 'node:assert/strict'

import { filaDeTraza, motivoDeEscalacion, RAZON_RAZONADOR } from './xsas-traza.mjs'

const conModelo = (capacidades, extra = {}) => ({
  capacidades: { via: 'modelo', nivel: 3, ...capacidades },
  llm: { modelo: 'modelo-x', proveedor: 'p', tokens: { in: 1, out: 1 }, usd: 0.001 },
  ...extra,
})

test('un pedido que NO escaló no inventa una razón: es null, y null es el caso masivo', () => {
  const r = { capacidades: { via: 'briefing.caja', nivel: 0, skills: [], tools: ['caja'] }, estado: 'ok' }
  assert.equal(motivoDeEscalacion(r), null)
  assert.equal(filaDeTraza({}, r).reasoner_required_reason, null)
})

test('EL DEFECTO: «FALLBACK» no es una justificación — entra como SIN_JUSTIFICAR, que es un hallazgo', () => {
  for (const basura of ['FALLBACK', 'DEFAULT', 'UNKNOWN', 'DESCONOCIDO', 'porque sí']) {
    assert.equal(
      motivoDeEscalacion(conModelo({ razon: basura, skills: ['costos-presupuestacion'] })),
      RAZON_RAZONADOR.SIN_JUSTIFICAR,
      `«${basura}» se coló como razón válida`,
    )
  }
})

test('la razón declarada por el gateway se respeta cuando está en el conjunto cerrado', () => {
  assert.equal(
    motivoDeEscalacion(conModelo({ razon: 'MISSING_RULE', skills: ['direccion-obra'] })),
    RAZON_RAZONADOR.MISSING_RULE,
  )
  // Y no depende de cómo la escribieron: la comparación es normalizada.
  assert.equal(motivoDeEscalacion(conModelo({ razon: ' missing_rule ' })), RAZON_RAZONADOR.MISSING_RULE)
})

test('sin skills reconocidas la escalación es AMBIGUOUS_INTENT — el ruteo no supo QUÉ se pidió', () => {
  assert.equal(motivoDeEscalacion(conModelo({ skills: [] })), RAZON_RAZONADOR.AMBIGUOUS_INTENT)
})

test('con dominio reconocido y sin tool ejecutable es MISSING_RULE: el candidato a convertirse en código', () => {
  const r = conModelo(
    { skills: ['finanzas-tesoreria-construccion'] },
    { degradacion: 'sin dato del OS: … ninguna capacidad determinística pudo correr; contesta el razonador' },
  )
  assert.equal(motivoDeEscalacion(r), RAZON_RAZONADOR.MISSING_RULE)
})

test('con dominio reconocido y sin motor faltante es UNSTRUCTURED_REASONING: había que pensarlo', () => {
  assert.equal(
    motivoDeEscalacion(conModelo({ skills: ['costos-presupuestacion', 'direccion-obra'] })),
    RAZON_RAZONADOR.UNSTRUCTURED_REASONING,
  )
})

test('una llamada al modelo SIEMPRE deja razón, aunque el gateway no la haya declarado', () => {
  // El agujero que esto tapa: `llm.modelo` presente y `reasoner_required_reason` en NULL sería una
  // llamada sin explicación, indistinguible de un pedido que nunca escaló.
  const fila = filaDeTraza({}, conModelo({ skills: ['impuestos-construccion'] }))
  assert.equal(fila.llm, true)
  assert.ok(fila.reasoner_required_reason, 'una llamada al modelo quedó sin razón')
})
