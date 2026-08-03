// EL TESORERO EN EL CHAT — que el dueño pueda descubrirlo preguntando, y que enganche cómo escribe.
//
// Una capacidad que no aparece cuando preguntás "qué sabés hacer" es, en la práctica, una capacidad
// que no existe. Y una gramática escrita en infinitivos no engancha a alguien que escribe en voseo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from './tesoreria.mjs'
import { catalogo } from '../registro-especialistas.mjs'

test('aparece en el catálogo de "qué sabés hacer", con ejemplos', async () => {
  const cat = await catalogo()
  const t = cat.find((e) => e.slug === 'tesoreria')
  assert.ok(t, 'el Tesorero no está en el catálogo: el dueño no puede descubrirlo')
  assert.equal(t.operativo, true)
  assert.ok(t.ejemplos.length >= 2, 'sin ejemplos, el catálogo no enseña a pedirlo')
  assert.match(t.descripcion, /Balanz/)
  assert.match(t.descripcion, /[Nn]unca ejecuta/, 'tiene que decir que no opera')
})

test('engancha cómo escribe el dueño, no infinitivos de manual', () => {
  // Voseo y formas de acá. Una lista de "analizar/invertir" no engancha ni una sola de estas.
  for (const frase of [
    'fijate qué hay disponible en balanz',
    'analizá si conviene invertir',
    'mirá qué rinde más',
    '@os buscá opciones para la plata que sobra',
    'conviene un plazo fijo?',
    'revisá las cauciones',
  ]) {
    assert.ok(especialista.reconoce(frase), `no reconoció: "${frase}"`)
  }
})

test('la caja sola es BARATA y no dispara el navegador', () => {
  // "cuánta plata me sobra" no tiene por qué esperar ocho minutos de relevamiento.
  for (const frase of ['cuánta plata me sobra', 'qué hago con la plata parada', 'tengo plata quieta?']) {
    const r = especialista.reconoce(frase)
    assert.ok(r, `no reconoció: "${frase}"`)
    assert.equal(r.destino, 'excedente', `"${frase}" disparó el análisis caro`)
  }
})

test('nombrar Balanz manda al análisis completo', () => {
  assert.equal(especialista.reconoce('qué hay en balanz').destino, 'analisis')
  assert.equal(especialista.reconoce('analizá si conviene invertir').destino, 'analisis')
})

test('si pega un enlace de Sheet, viaja al análisis', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8/edit'
  const r = especialista.reconoce(`analizá este flujo de fondos y fijate en balanz: ${url}`)
  assert.equal(r.destino, 'analisis')
  assert.match(r.sheet, /1SR6HY5m/, 'perdió el Sheet que el dueño indicó')
})

test('NO se queda con mensajes que no son suyos', () => {
  // Es transversal y atiende por reclamo. Si se quedara con todo lo que suena a plata, robaría
  // pedidos de cobranzas, de sueldos y de compras — y el dueño no sabría por qué le contesta el
  // agente equivocado.
  for (const frase of [
    'registrar asistencia',
    'quién trabajó ayer',
    'estado del sistema',
    'pagale a Pedro',
    'cuánto le debemos a Cemento SA',
    'hola',
  ]) {
    assert.equal(especialista.reconoce(frase), null, `se quedó con: "${frase}"`)
  }
})

test('es el dueño del canal, pero llegar por el canal NO dispara el análisis caro', async () => {
  // Es el único especialista de Administración y Finanzas, así que el canal es suyo (el registro
  // exige exactamente un preferido por área). Pero un "cuánto le debemos a Cemento SA" escrito ahí
  // llega sin intención reconocible, y no puede desencadenar ocho minutos de relevamiento del
  // bróker ni ocupar el navegador.
  assert.notEqual(especialista.preferidoDeArea, false)
  const r = await especialista.atender({ texto: 'cuánto le debemos a Cemento SA', intencion: null, google: null })
  assert.equal(r.estado, 'ayuda', 'llegó a correr el análisis sin que nadie lo pidiera')
  assert.match(r.texto, /cuánta plata te sobra/)
  assert.match(r.texto, /Nunca ejecuto/)
})

test('declara el agente y el área que existen de verdad', () => {
  assert.equal(especialista.agentSlug, 'tesorero')
  assert.equal(especialista.area, 'administracion_finanzas')
})

test('la skill declarada distingue las dos capacidades', () => {
  assert.equal(especialista.skillDe({ destino: 'excedente' }), 'tesoreria.excedente_invertible')
  assert.equal(especialista.skillDe({ destino: 'analisis' }), 'tesoreria.analisis_inversion')
})
