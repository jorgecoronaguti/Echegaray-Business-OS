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

test('si la migración todavía no se aplicó, el pedido se registra igual (degradado, no perdido)', async () => {
  // La trampa que este repo ya pagó: el .sql en el repo no es el .sql aplicado. Con el insert
  // nuevo fallando, TODA la telemetría del chat se apagaría en silencio — el instrumento roto
  // justo por venir a mejorarlo.
  const { registrarPedidoDelChat } = await import('./skill-metricas.mjs')
  const vistas = []
  const ejecutar = async (sql, params) => {
    vistas.push({ n: params.length })
    if (sql.includes('skills')) throw new Error('column "skills" of relation "chat_request" does not exist')
    return { rows: [] }
  }
  const valores = ['rid', 'que tengo vencido', 'jorge', 'web', 'advise.finance', 'briefing', 0, 120, 'normal', null, ['finanzas-tesoreria-construccion'], 'determinista', 0]
  assert.equal(await registrarPedidoDelChat(valores, ejecutar), 'degradado')
  assert.deepEqual(vistas.map((v) => v.n), [13, 10], 'primero el completo, después el de siempre')
})

test('con el esquema al día se registra completo, sin segunda escritura', async () => {
  const { registrarPedidoDelChat } = await import('./skill-metricas.mjs')
  let veces = 0
  const ejecutar = async () => { veces++; return { rows: [] } }
  assert.equal(await registrarPedidoDelChat(new Array(13).fill(null), ejecutar), 'completo')
  assert.equal(veces, 1)
})

test('si la base entera está caída, la telemetría no lanza', async () => {
  const { registrarPedidoDelChat } = await import('./skill-metricas.mjs')
  const ejecutar = async () => { throw new Error('sin conexión') }
  assert.equal(await registrarPedidoDelChat(new Array(13).fill(null), ejecutar), 'perdido')
})
