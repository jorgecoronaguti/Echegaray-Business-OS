// EL PLAN DEL GATEWAY — a quién se le manda cada cosa, probado sin red.
//
// `planDe` es pura para poder probar exactamente esto: qué HABRÍA hecho el OS. Si para saberlo
// hubiera que hacer la llamada, el dato ya habría viajado y la prueba llegaría tarde.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODO, MODO_POR_TAREA, EVIDENCIA_DE_PRODUCCION, modoDe, planDe, planSegunContenido, presupuestoMs } from './gateway.mjs'

const nombres = (plan) => plan.cadena.map((c) => c.proveedor.nombre)

test('un dato confidencial va a Claude y NI SIQUIERA se mide en sombra con HF', () => {
  const p = planDe({ tarea: 'elegir-herramienta', dominio: 'cobranzas' })
  assert.deepEqual(nombres(p), ['anthropic'])
  // La sombra también manda contenido afuera. Medir un modelo no es excusa para exportar un dato:
  // sería exactamente la fuga que la política existe para impedir, con la coartada de un benchmark.
  assert.equal(p.sombra, null, 'la sombra sacó un dato confidencial de la empresa')
  assert.match(p.porQue, /confidential/i)
})

test('el motivo distingue «el dato no podía salir» de «el modelo no está habilitado»', () => {
  const porDato = planDe({ tarea: 'elegir-herramienta', dominio: 'legajo' })
  const porTarea = planDe({ tarea: 'una-tarea-cualquiera', dominio: 'intenciones' })
  assert.match(porDato.porQue, /restricted/i)
  assert.match(porTarea.porQue, /no está habilitada/i)
  // Son problemas opuestos: uno se arregla con una autorización del dueño, el otro con un
  // benchmark. Un reporte que los junte manda a trabajar en la dirección equivocada.
  assert.notEqual(porDato.porQue, porTarea.porQue)
})

test('una intención en sombra: Claude sirve y HF mide al lado', () => {
  // `interpretar` sigue en sombra a propósito: su salida es un objeto libre y no hay lista cerrada
  // contra la cual validarla. Es el caso que NO se abre.
  const p = planDe({ tarea: 'interpretar', dominio: 'intenciones' })
  assert.deepEqual(nombres(p), ['anthropic'], 'en sombra el que sirve sigue siendo Claude')
  assert.equal(p.sombra?.nombre, 'huggingface')
})

test('sin token de HF no hay sombra ni cadena de HF, y el motivo lo dice', () => {
  const p = planDe({ tarea: 'elegir-herramienta', dominio: 'intenciones', hfDisponible: false })
  assert.deepEqual(nombres(p), ['anthropic'])
  assert.equal(p.sombra, null)
  assert.match(p.porQue, /token/i)
})

test('lo que no está listado está APAGADO: el default es no participar', () => {
  assert.equal(modoDe('una-tarea-que-nadie-declaro'), MODO.APAGADO)
  assert.equal(modoDe(undefined), MODO.APAGADO)
  const p = planDe({ tarea: 'inventada', dominio: 'intenciones' })
  assert.equal(p.sombra, null)
  assert.deepEqual(nombres(p), ['anthropic'])
})

test('ninguna tarea llega a producción sin su corrida escrita al lado', () => {
  // Este test es un candado sobre MÍ, y sigue siéndolo después de abrir la puerta. Antes decía
  // «ninguna en producción», que era verdad mientras no hubiera ninguna y dejaba de servir en el
  // momento exacto en que empezaba a importar. Ahora exige lo que de verdad hay que exigir: que
  // cada tarea promovida cite su corrida, su fecha, su número y CONTRA QUÉ se comparó.
  for (const [tarea, modo] of Object.entries(MODO_POR_TAREA)) {
    if (modo !== MODO.PRODUCCION) {
      assert.equal(EVIDENCIA_DE_PRODUCCION[tarea], undefined,
        `«${tarea}» no está en producción pero figura en la tabla de evidencia: sobra`)
      continue
    }
    const e = EVIDENCIA_DE_PRODUCCION[tarea]
    assert.ok(e, `«${tarea}» está en producción sin evidencia declarada`)
    for (const campo of ['corrida', 'fecha', 'modelo', 'medido', 'contra']) {
      assert.ok(e[campo] && String(e[campo]).trim(), `«${tarea}»: falta ${campo}`)
    }
    assert.match(e.fecha, /^\d{4}-\d{2}-\d{2}$/, `«${tarea}»: la fecha no es una fecha`)
  }
})

test('en producción HF atiende y Claude queda de escalamiento, en ese orden', () => {
  const p = planDe({ tarea: 'rutear', dominio: 'intenciones' })
  assert.deepEqual(nombres(p), ['huggingface', 'anthropic'])
  assert.equal(p.cadena[0].rol, 'principal')
  assert.equal(p.cadena[1].rol, 'escalamiento', 'Claude tiene que quedar detrás, no desaparecer')
  // Y la sombra se apaga: medir en paralelo a quien ya atiende sería pagar dos veces lo mismo.
  assert.equal(p.sombra, null)
})

test('en producción, si HF no está configurado la operación la atiende Claude igual', () => {
  const p = planDe({ tarea: 'rutear', dominio: 'intenciones', hfDisponible: false })
  assert.deepEqual(nombres(p), ['anthropic'])
  assert.equal(p.cadena[0].rol, 'principal')
})

test('un dominio CONFIDENTIAL no entra a producción de HF ni estando la tarea abierta', () => {
  // `rutear` está en PRODUCCIÓN. Eso NO alcanza: la política manda sobre el modo.
  const p = planDe({ tarea: 'rutear', dominio: 'cobranzas' })
  assert.deepEqual(nombres(p), ['anthropic'])
  assert.equal(p.sombra, null)
  assert.match(p.porQue, /confidential/i)
})

test('la autorización explícita es por caso, no un interruptor global', () => {
  const sin = planDe({ tarea: 'interpretar', dominio: 'obras' })
  const con = planDe({ tarea: 'interpretar', dominio: 'obras', permitidoExplicitamente: true })
  assert.equal(sin.sombra, null)
  assert.equal(con.sombra?.nombre, 'huggingface')
  // Y no contamina al siguiente: la autorización viaja en la llamada, no en un estado del módulo.
  assert.equal(planDe({ tarea: 'interpretar', dominio: 'obras' }).sombra, null)
})

// ── EL GUARDIÁN DE CONTENIDO, AHORA TAMBIÉN EN EL CAMINO QUE SIRVE ───────────────────────────────

test('un contenido con CUIT saca a HF de la cadena de PRODUCCIÓN y lo atiende Claude', () => {
  const p = planDe({ tarea: 'rutear', dominio: 'intenciones' })
  assert.deepEqual(nombres(p), ['huggingface', 'anthropic'], 'precondición: HF atiende')
  const q = planSegunContenido(p, ['parece contener un CUIT'])
  assert.deepEqual(nombres(q), ['anthropic'])
  // El que queda pasa a ser el principal: si conservara «escalamiento», la fila de costo diría que
  // Claude escaló algo que nunca se intentó.
  assert.equal(q.cadena[0].rol, 'principal')
  assert.match(q.porQue, /CUIT/)
})

test('sin hallazgos el plan no se toca: el guardián no puede degradar lo limpio', () => {
  const p = planDe({ tarea: 'rutear', dominio: 'intenciones' })
  assert.equal(planSegunContenido(p, []), p)
})

test('si el único que queda es Claude, el guardián no lo saca: dejaría la operación sin nadie', () => {
  const soloClaude = planDe({ tarea: 'rutear', dominio: 'cobranzas' })
  const q = planSegunContenido(soloClaude, ['parece contener un importe en pesos'])
  assert.deepEqual(nombres(q), ['anthropic'])
})

test('el presupuesto de latencia es un número positivo y se puede mover por entorno', () => {
  assert.equal(presupuestoMs({}), 8000)
  assert.equal(presupuestoMs({ ORQ_HF_MS_MAX: '2500' }), 2500)
  // Un valor basura no puede dejar el presupuesto en 0: 0 significa «sin techo».
  assert.equal(presupuestoMs({ ORQ_HF_MS_MAX: 'ni idea' }), 8000)
  assert.equal(presupuestoMs({ ORQ_HF_MS_MAX: '-1' }), 8000)
})

// ── LA SOMBRA MIRA EL CONTENIDO, NO SÓLO LA ETIQUETA DEL DOMINIO ─────────────────────────────────

import { llmRun } from './gateway.mjs'

test('la sombra NO sale si el contenido trae un CUIT, aunque el dominio sea INTERNAL', async () => {
  // `politica.mjs` clasifica por DOMINIO, que es una etiqueta que pone quien llama. Una etiqueta
  // correcta no garantiza un contenido limpio: el prompt de `elegir-partida` lleva el texto literal
  // del plano, y un plano puede tener un nombre o un CUIT en el rótulo.
  const llamadas = []
  const fetchImpl = async (url) => {
    llamadas.push(url)
    return { ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: {} }), text: async () => '' }
  }
  const r = await llmRun({
    tarea: 'elegir-herramienta', dominio: 'partidas',
    mensajes: [{ role: 'user', content: 'la obra de 30-71234567-8 lleva columna C1' }],
    apiKey: 'x', fetchImpl, agente: 'test', funcion: 'test',
  })
  // Sin `if`: si `llmRun` lanzara, el test tiene que ponerse ROJO, no saltearse las aserciones.
  // Un condicional acá convierte el control en una constante que nunca puede fallar.
  assert.ok(r.sombraOmitida, 'la sombra salió con un CUIT adentro')
  assert.match(r.sombraOmitida.join(' '), /CUIT/i)
  // Y sólo hubo UNA llamada: la de Claude, que sí puede ver ese contenido.
  assert.ok(llamadas.every((u) => !String(u).includes('huggingface')), 'se mandó contenido a HF')
})
