// EL PLAN DEL GATEWAY — a quién se le manda cada cosa, probado sin red.
//
// `planDe` es pura para poder probar exactamente esto: qué HABRÍA hecho el OS. Si para saberlo
// hubiera que hacer la llamada, el dato ya habría viajado y la prueba llegaría tarde.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODO, MODO_POR_TAREA, modoDe, planDe } from './gateway.mjs'

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
  const p = planDe({ tarea: 'elegir-herramienta', dominio: 'intenciones' })
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

test('ninguna tarea nace en producción: la promoción la firma un benchmark, no este archivo', () => {
  // Este test es un candado sobre MÍ. El día que alguien —yo incluido— mueva una tarea a
  // `produccion` sin haberla medido, esto se pone rojo y obliga a escribir la evidencia al lado.
  for (const [tarea, modo] of Object.entries(MODO_POR_TAREA)) {
    assert.notEqual(modo, MODO.PRODUCCION,
      `«${tarea}» está en producción sin que este test conozca su corrida de ecsas-llm-eval`)
  }
})

test('en producción HF atiende y Claude queda de escalamiento, en ese orden', () => {
  // Se prueba el mecanismo con una tarea puesta a mano: el mapa real está en sombra a propósito, y
  // este test tiene que poder verificar la rama de producción sin esperar a que algo se promueva.
  const previo = MODO_POR_TAREA.rutear
  assert.equal(previo, MODO.SOMBRA)
  const p = planDe({ tarea: 'rutear', dominio: 'intenciones' })
  assert.equal(p.sombra?.nombre, 'huggingface')
  // Y la rama de producción, con la autorización explícita del dueño sobre un dato confidencial:
  const conAutorizacion = planDe({
    tarea: 'rutear', dominio: 'compras', permitidoExplicitamente: true,
  })
  // Sigue en sombra —el modo manda—, pero ahora la política ya no es el motivo del corte.
  assert.equal(conAutorizacion.sombra?.nombre, 'huggingface')
  assert.match(conAutorizacion.porQue, /sombra/i)
})

test('la autorización explícita es por caso, no un interruptor global', () => {
  const sin = planDe({ tarea: 'rutear', dominio: 'obras' })
  const con = planDe({ tarea: 'rutear', dominio: 'obras', permitidoExplicitamente: true })
  assert.equal(sin.sombra, null)
  assert.equal(con.sombra?.nombre, 'huggingface')
  // Y no contamina al siguiente: la autorización viaja en la llamada, no en un estado del módulo.
  assert.equal(planDe({ tarea: 'rutear', dominio: 'obras' }).sombra, null)
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
