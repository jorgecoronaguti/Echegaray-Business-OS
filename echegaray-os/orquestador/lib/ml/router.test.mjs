// LO QUE ESTE TEST PROTEGE ES EL CONTRATO, NO LA IMPLEMENTACIÓN: la forma de la respuesta, el orden
// de la escalera y la puerta de privacidad. Los modelos van a cambiar; esto no puede.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { METODO, ACCION, UMBRAL, accionPara, resultado } from './resultado.mjs'
import { puedeSalir, sensibilidadDe, SENSIBILIDAD } from './politica.mjs'
import { paraProduccion, MODELOS, ESTADO } from './registro.mjs'
import { registrarSolucionador, limpiarSolucionadores, resolver, classify, embed } from './router.mjs'

beforeEach(() => limpiarSolucionadores())

// ── EL CONTRATO DE RESPUESTA ──

test('toda respuesta trae accion derivada de la confianza, nunca undefined', async () => {
  registrarSolucionador('classify', METODO.ML_LOCAL, async () => ({ valor: 'X', confianza: 0.75 }))
  const r = await classify('algo', { dominio: 'compras' })
  assert.equal(r.accion, ACCION.SUGERIR)
  assert.ok(r.traceId, 'trace_id siempre presente')
  assert.equal(typeof r.ms, 'number')
  assert.equal(r.capacidad, 'classify')
})

test('un identificador fuerte se APLICA aunque no declare confianza', () => {
  assert.equal(accionPara(null, METODO.REGLA), ACCION.APLICAR)
  assert.equal(accionPara(undefined, METODO.SQL), ACCION.APLICAR)
})

test('los tres umbrales del dueño: alta resuelve, media sugiere, baja no vincula', () => {
  assert.equal(accionPara(UMBRAL.ALTA, METODO.ML_LOCAL), ACCION.APLICAR)
  assert.equal(accionPara(UMBRAL.MEDIA, METODO.ML_LOCAL), ACCION.SUGERIR)
  assert.equal(accionPara(UMBRAL.MEDIA - 0.01, METODO.ML_LOCAL), ACCION.DESCARTAR)
})

// ── LA ESCALERA ──

test('gana el escalón más barato aunque se registre después', async () => {
  registrarSolucionador('classify', METODO.CLAUDE, async () => ({ valor: 'caro', confianza: 1 }))
  registrarSolucionador('classify', METODO.REGLA, async () => ({ valor: 'barato', confianza: 1 }))
  const r = await classify('x', { dominio: 'compras' })
  assert.equal(r.valor, 'barato')
  assert.equal(r.metodo, METODO.REGLA)
  assert.equal(r.huboFallback, false)
})

test('si el escalón barato no puede, baja al siguiente y lo declara como fallback', async () => {
  registrarSolucionador('classify', METODO.REGLA, async () => null)
  registrarSolucionador('classify', METODO.ML_LOCAL, async () => ({ valor: 'ml', confianza: 0.95 }))
  const r = await classify('x', { dominio: 'compras' })
  assert.equal(r.valor, 'ml')
  assert.equal(r.huboFallback, true)
  assert.ok(r.saltados[0].includes('no pudo resolverlo'))
})

test('un escalón que EXPLOTA no tumba la cadena', async () => {
  registrarSolucionador('classify', METODO.REGLA, async () => { throw new Error('se cayó el modelo') })
  registrarSolucionador('classify', METODO.ML_LOCAL, async () => ({ valor: 'sobreviví', confianza: 0.95 }))
  const r = await classify('x', { dominio: 'compras' })
  assert.equal(r.valor, 'sobreviví')
  assert.ok(r.saltados[0].includes('falló'))
})

test('una capacidad sin solucionador NO es un error: devuelve sin-resolver con el motivo', async () => {
  const r = await embed('x', { dominio: 'compras' })
  assert.equal(r.metodo, METODO.SIN_RESOLVER)
  assert.equal(r.valor, null)
  assert.match(r.porQue, /no tiene solucionador/)
})

test('`hasta` pone un techo: no se escala más caro de lo pedido', async () => {
  registrarSolucionador('classify', METODO.CLAUDE, async () => ({ valor: 'caro', confianza: 1 }))
  const r = await resolver('classify', 'x', { dominio: 'compras', hasta: METODO.ML_LOCAL })
  assert.equal(r.metodo, METODO.SIN_RESOLVER)
  assert.ok(r.saltados[0].includes('techo'))
})

// ── LA PUERTA DE PRIVACIDAD ──

test('un dominio RESTRICTED nunca sale a Hugging Face, aunque haya solucionador', async () => {
  registrarSolucionador('classify', METODO.HF_REMOTO, async () => ({ valor: 'no debería verse', confianza: 1 }))
  const r = await classify('el saldo del banco', { dominio: 'banco' })
  assert.equal(r.valor, null)
  assert.equal(r.sensibilidad, SENSIBILIDAD.RESTRICTED)
  assert.ok(r.saltados[0].includes('no deja salir'))
})

test('CONFIDENTIAL tampoco sale a HF sin autorización explícita — y con ella, sí', async () => {
  registrarSolucionador('classify', METODO.HF_REMOTO, async () => ({ valor: 'ok', confianza: 1 }))
  const sin = await classify('x', { dominio: 'compras' })
  assert.equal(sin.valor, null)
  const con = await classify('x', { dominio: 'compras', permitidoExplicitamente: true })
  assert.equal(con.valor, 'ok')
})

// LO QUE ESTE TEST IMPIDE ES ROMPER PRODUCCIÓN: el briefing de caja y el Director ya le mandan la
// posición bancaria a Claude todos los días. Una política que lo bloqueara sería un apagón.
test('Claude SÍ puede con datos RESTRICTED del negocio — ya está en producción', () => {
  assert.equal(puedeSalir('banco', 'anthropic').permitido, true)
  assert.equal(puedeSalir('legajo', 'anthropic').permitido, true)
})

test('las credenciales no viajan a NINGÚN proveedor, tampoco a Claude', () => {
  assert.equal(puedeSalir('credenciales', 'anthropic').permitido, false)
  assert.equal(puedeSalir('credenciales', 'huggingface').permitido, false)
})

test('un dominio que nadie declaró se trata como CONFIDENTIAL, no como interno', () => {
  assert.equal(sensibilidadDe('algo-que-nadie-clasifico'), SENSIBILIDAD.CONFIDENTIAL)
})

test('lo local se puede siempre, incluso RESTRICTED', () => {
  assert.equal(puedeSalir('banco', 'local').permitido, true)
})

// ── EL REGISTRO ──

test('producción rechaza cualquier modelo que no llegó a estado produccion', () => {
  // ESTE TEST AFIRMABA EL ESTADO DEL MUNDO, NO LA REGLA.
  //
  // Decía `paraProduccion('embeddings.es') === false` porque ese modelo era candidato. El día que
  // ganó su benchmark y pasó a producción —con revisión clavada y medición, que es exactamente lo
  // que el guardián exige— el test se puso rojo sin que la regla hubiera cambiado. Un test que se
  // rompe cuando el sistema hace lo correcto no protege nada: entrena a ignorarlo.
  //
  // Ahora prueba la REGLA sobre cualquier modelo que no esté en producción, sea cual sea.
  const noProductivos = Object.entries(MODELOS).filter(([, m]) => m.estado !== ESTADO.PRODUCCION)
  assert.ok(noProductivos.length, 'el registro tiene que tener algún modelo fuera de producción')
  for (const [clave, m] of noProductivos) {
    const r = paraProduccion(clave)
    assert.equal(r.ok, false, `«${clave}» está en ${m.estado} y el guardián lo dejó pasar`)
  }
})

test('ningún modelo local puede estar en produccion sin revisión clavada ni medición', () => {
  for (const [clave, m] of Object.entries(MODELOS)) {
    if (m.estado !== ESTADO.PRODUCCION || m.proveedor === 'anthropic') continue
    assert.ok(m.revision, `«${clave}» está en producción sin revisión clavada`)
    assert.ok(m.medido, `«${clave}» está en producción sin medición en esta VM`)
  }
})

test('resolver sin dominio es un error: sin él no hay puerta de privacidad', async () => {
  await assert.rejects(() => resolver('classify', 'x', {}), /necesita un dominio/)
})

test('resultado() nunca devuelve una respuesta sin traceId', () => {
  assert.ok(resultado({}).traceId)
})
