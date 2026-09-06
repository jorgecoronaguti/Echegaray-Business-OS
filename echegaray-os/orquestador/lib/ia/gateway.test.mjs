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

// ── HF ATENDIENDO DE VERDAD: LO QUE PASA CUANDO NO PUEDE ─────────────────────────────────────────

/** Un `fetch` que distingue los dos destinos y responde lo que cada caso necesita. */
function fetchDoble({ hf, claude }) {
  const vistas = []
  const impl = async (url, opts) => {
    const esHf = String(url).includes('huggingface')
    vistas.push(esHf ? 'hf' : 'claude')
    return (esHf ? hf : claude)(url, opts)
  }
  return { impl, vistas }
}

const okClaude = async () => ({
  ok: true, status: 200, headers: { get: () => null },
  json: async () => ({ content: [{ type: 'text', text: 'contestó claude' }], usage: {} }),
  text: async () => '',
})

test('HF sin cuota NO apaga el razonador del OS: eso es un estado sobre Claude', async () => {
  const avisos = []
  const { impl, vistas } = fetchDoble({
    hf: async () => ({ ok: false, status: 402, headers: { get: () => null }, text: async () => 'sin creditos', json: async () => ({}) }),
    claude: okClaude,
  })
  const r = await llmRun({
    tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'hola',
    mensajes: [{ role: 'user', content: 'hola' }],
    apiKey: 'x', fetchImpl: impl, avisar: async (c) => { avisos.push(c.kind) },
  })
  assert.deepEqual(vistas, ['hf', 'claude'], 'no escaló a Claude después del 402 de HF')
  assert.equal(r.texto, 'contestó claude')
  assert.equal(r.escalado, true)
  // ÉSTE es el punto: `avisarEstado` marca «sin crédito» y con eso el OS entero degrada. Un 402 de
  // HF significa lo contrario —que Claude tiene que atender— y no puede tocar ese estado.
  assert.deepEqual(avisos, [], `HF marcó el razonador del OS como caído: ${avisos.join(',')}`)
})

test('un fallo de Claude SÍ avisa: el control tiene que poder decir que sí, no sólo que no', async () => {
  const avisos = []
  const { impl } = fetchDoble({
    hf: async () => ({ ok: false, status: 500, headers: { get: () => null }, text: async () => 'x', json: async () => ({}) }),
    claude: async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => 'sin credencial', json: async () => ({}) }),
  })
  await assert.rejects(() => llmRun({
    tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'hola',
    mensajes: [{ role: 'user', content: 'hola' }],
    apiKey: 'x', fetchImpl: impl, avisar: async (c) => { avisos.push(c.kind) },
  }))
  assert.deepEqual(avisos, ['auth'], 'un 401 de Claude dejó de avisar: el aviso quedó muerto para todos')
})

test('HF que no contesta a tiempo escala a Claude y el usuario recibe su respuesta igual', async () => {
  const { impl, vistas } = fetchDoble({
    // Cuelga hasta que la señal aborte, o hasta un tope propio muy por encima del presupuesto. Es
    // el modo de falla que NO se recupera solo: no es un error, es una espera indefinida.
    hf: (url, opts) => new Promise((_, rechazar) => {
      opts?.signal?.addEventListener?.('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })))
      setTimeout(() => rechazar(new Error('el doble se cansó')), 30_000).unref?.()
    }),
    claude: okClaude,
  })
  const previo = process.env.ORQ_HF_MS_MAX
  process.env.ORQ_HF_MS_MAX = '250'
  try {
    // ═══ LA CARRERA ES PARTE DEL CONTROL, NO UN ADORNO ═══
    //
    // Sin ella, quitar el presupuesto no pone el test en rojo: lo deja COLGADO hasta el timeout del
    // runner, que es un modo de falla peor —parece contención, parece la máquina, parece cualquier
    // cosa menos el bug—. Con la carrera, la ausencia del corte es un `AssertionError` en un
    // segundo. Verificado mutando la línea del presupuesto.
    const carrera = await Promise.race([
      llmRun({
        tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'hola',
        mensajes: [{ role: 'user', content: 'hola' }],
        apiKey: 'x', fetchImpl: impl, avisar: async () => {},
      }).then((r) => ({ tipo: 'contestó', r })),
      new Promise((res) => { setTimeout(() => res({ tipo: 'colgado' }), 4000).unref?.() }),
    ])
    assert.equal(carrera.tipo, 'contestó', 'el presupuesto de latencia no cortó: la operación quedó colgada')
    assert.deepEqual(vistas, ['hf', 'claude'])
    assert.equal(carrera.r.texto, 'contestó claude')
    assert.equal(carrera.r.escalado, true, 'la respuesta no quedó marcada como escalada')
  } finally {
    if (previo === undefined) delete process.env.ORQ_HF_MS_MAX
    else process.env.ORQ_HF_MS_MAX = previo
  }
})

test('cuando HF contesta, contesta HF: la operación queda marcada como autónoma', async () => {
  const { impl, vistas } = fetchDoble({
    hf: async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ model: 'Qwen/Qwen3-4B-Instruct-2507', choices: [{ message: { content: 'cfo' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
      text: async () => '',
    }),
    claude: okClaude,
  })
  const r = await llmRun({
    tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'hola',
    mensajes: [{ role: 'user', content: 'hola' }],
    apiKey: 'x', fetchImpl: impl, avisar: async () => {},
  })
  assert.deepEqual(vistas, ['hf'], 'se llamó a Claude aunque HF había contestado')
  assert.equal(r.proveedor, 'huggingface')
  assert.equal(r.texto, 'cfo')
  // `autonomo` es el numerador del Autonomy Rate. Si esto se pusiera en false, el número diría que
  // el OS no resolvió nada mientras lo resuelve todo.
  assert.equal(r.autonomo, true)
  assert.equal(r.escalado, false)
})

test('una llamada por el gateway CONSUME presupuesto del fusible, igual que una por el cliente', async () => {
  const { conPresupuesto, presupuestoActual } = await import('./fusible.mjs')
  const { impl } = fetchDoble({
    hf: async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ model: 'qwen', choices: [{ message: { content: 'cfo' } }], usage: {} }),
      text: async () => '',
    }),
    claude: okClaude,
  })
  // ═══ POR QUÉ ESTE TEST ═══
  //
  // Los dos proveedores llaman a `verificar()`, que NO consume: su comentario dice que el consumo
  // lo cuenta el cliente. Por el gateway no pasa ningún cliente. Mientras esto fue sombra daba
  // igual; desde que atiende, una llamada que no cuenta es una llamada sin tope.
  await conPresupuesto({ correlacion: 'test-fusible' }, async () => {
    const antes = presupuestoActual().llamadas
    await llmRun({
      tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'hola',
      mensajes: [{ role: 'user', content: 'hola' }],
      apiKey: 'x', fetchImpl: impl, avisar: async () => {},
    })
    assert.equal(presupuestoActual().llamadas, antes + 1,
      'la llamada del gateway no consumió presupuesto: corre sin tope de llamadas, de USD ni de tiempo')
  })
})

test('agotado el presupuesto, el gateway no llama a nadie más', async () => {
  const { conPresupuesto } = await import('./fusible.mjs')
  const vistas = []
  const impl = async (url) => {
    vistas.push(String(url).includes('huggingface') ? 'hf' : 'claude')
    return { ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: 'x' } }], content: [{ type: 'text', text: 'x' }], usage: {} }),
      text: async () => '' }
  }
  await conPresupuesto({ correlacion: 'test-tope', limites: { maxLlamadas: 1, maxVision: 40, maxUsd: 5, maxMs: 300_000 } }, async () => {
    await llmRun({
      tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'a',
      mensajes: [{ role: 'user', content: 'a' }], apiKey: 'x', fetchImpl: impl, avisar: async () => {},
    })
    assert.equal(vistas.length, 1, 'la primera llamada tiene que salir')
    // La segunda operación ya no entra: ni el principal ni el escalamiento.
    await assert.rejects(() => llmRun({
      tarea: 'rutear', dominio: 'intenciones', datosNoConfiables: 'b',
      mensajes: [{ role: 'user', content: 'b' }], apiKey: 'x', fetchImpl: impl, avisar: async () => {},
    }))
    assert.equal(vistas.length, 1, `el fusible no cortó: salieron ${vistas.length} llamadas`)
  })
})
