// "¿ESTO PAGÓ UN MODELO?" SE DECIDE EN UN SOLO LUGAR.
//
// El contador de eficiencia del server y la columna `resolucion` de `orq.chat_request` responden la
// MISMA pregunta. Con dos copias de la regla, la que quede vieja miente sin avisar: una respuesta
// atendida por un modelo nuevo se contaría como resuelta con 0 API y el porcentaje de
// autoabastecimiento del OS quedaría inflado justo cuando más se está gastando.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pagoModelo, resolucionDeRespuesta } from './skill-metricas.mjs'

test('las etiquetas de las capacidades determinísticas no pagan modelo', () => {
  // Son las que devuelve el chat cuando resuelve con código: briefing de caja, agenda, memoria…
  for (const m of ['briefing', 'agenda', 'memoria', 'caja-proyeccion', 'costo', 'ayuda', 'libro-iva', 'ficha-obra']) {
    assert.equal(pagoModelo(m), false, m)
    assert.equal(resolucionDeRespuesta(m), 'determinista', m)
  }
})

test('los modelos reales y los especialistas pagan', () => {
  for (const m of ['haiku', 'sonnet', 'opus', 'agente:cfo', 'Sonnet']) {
    assert.equal(pagoModelo(m), true, m)
    assert.equal(resolucionDeRespuesta(m), 'llm', m)
  }
})

test('un estado transitorio no es una ejecución: no cuenta de ningún lado', () => {
  // Contarlos como determinísticos inflaría el "resuelto sin LLM" con pedidos que no terminaron.
  for (const m of ['trabajando', 'cancelado', 'error', '', null, undefined]) {
    assert.equal(resolucionDeRespuesta(m), null, String(m))
  }
})
