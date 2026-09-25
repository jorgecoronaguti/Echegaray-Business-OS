// Las iniciales de quien pagó (24/09/2026): qué decide el bot con lo que leyó, qué entiende de la respuesta
// escrita del dueño y qué NO cambia cuando el papel no trae iniciales.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarRespuesta, botonesPregunta, crearPorIniciales, decidirPorIniciales, distancia, interpretarRespuesta,
  lineaDeIniciales, textoPregunta, UMBRAL_CONFIANZA,
} from './iniciales.mjs'
import { inicialesLeidas } from '../../lib/comprobantes/lectura.mjs'
import { esRespuestaDePregunta } from '../mattermost-ws-consumer.mjs'

// Las cuatro aprobadas por el dueño el 24/09 (JP, no JPN). ER-0020 es la entrega abierta real de Emiliano.
const EM = { persona_id: 'pEM', iniciales: 'EM', nombre: 'Emiliano Maldonado', entregas: [{ id: 'e20', codigo: 'ER-0020' }, { id: 'e31', codigo: 'ER-0031' }] }
const JP = { persona_id: 'pJP', iniciales: 'JP', nombre: 'Juan Pablo Nievas', entregas: [{ id: 'e21', codigo: 'ER-0021' }] }
const JC = { persona_id: 'pJC', iniciales: 'JC', nombre: 'Jorge Corona', entregas: [] }
const RE = { persona_id: 'pRE', iniciales: 'RE', nombre: 'Rodrigo Echegaray', entregas: [] }
const PERSONAS = [EM, JP, JC, RE]

test('la lectura limpia las iniciales: «J.P.», «em», con o sin confianza; una letra sola no es iniciales', () => {
  assert.deepEqual(inicialesLeidas('J.P.', 0.95), { letras: 'JP', confianza: 0.95 })
  assert.deepEqual(inicialesLeidas('em', null), { letras: 'EM', confianza: null })
  assert.equal(inicialesLeidas('X', 1), null)
  assert.equal(inicialesLeidas(null, null), null)
  assert.equal(inicialesLeidas('ABCDE', 1), null)
})

test('las iniciales tienen que estar en la transcripción manuscrita del mismo modelo (foto real 17:04 #3: «CF» impreso)', () => {
  // Lecturas REALES del 25/09 sobre fotos del canal (prompt nuevo, Haiku):
  assert.deepEqual(inicialesLeidas('EM', 0.85, 'Taller · EM · pagado'), { letras: 'EM', confianza: 0.85 })
  assert.equal(inicialesLeidas('CF', 0.4, 'Toyotita · EEA885 · pagado.'), null, 'el C.F. impreso no es de nadie')
  assert.deepEqual(inicialesLeidas('JP', 0.9, 'retira J.P. · SF'), { letras: 'JP', confianza: 0.9 })
  assert.deepEqual(inicialesLeidas('JP', 0.9, 'J P'), { letras: 'JP', confianza: 0.9 })
  assert.equal(inicialesLeidas('EM', 0.9, 'retira Emiliano'), null, 'adentro de una palabra no cuenta')
  assert.equal(inicialesLeidas('SF', 0.9, null), null, 'sin transcripción, no hay iniciales')
  assert.equal(inicialesLeidas('JP', 0.9, 'JPN'), null)
})

test('iniciales claras de alguien con entrega → se imputa solo, a la entrega MÁS VIEJA abierta', () => {
  const d = decidirPorIniciales({ letras: 'EM', confianza: 0.93 }, PERSONAS)
  assert.equal(d.estado, 'auto')
  assert.equal(d.persona.codigo, 'ER-0020')
})

test('confianza baja, letras parecidas o de nadie: NO imputa solo', () => {
  assert.equal(decidirPorIniciales({ letras: 'EM', confianza: UMBRAL_CONFIANZA - 0.01 }, PERSONAS).estado, 'pregunta')
  assert.equal(decidirPorIniciales({ letras: 'EM', confianza: null }, PERSONAS).estado, 'pregunta', 'sin número de confianza, se pregunta')
  const parecida = decidirPorIniciales({ letras: 'EN', confianza: 0.95 }, PERSONAS)
  assert.equal(parecida.estado, 'pregunta')
  assert.deepEqual(parecida.candidatos.map((c) => c.iniciales), ['EM'], 'sólo candidatos con entrega abierta')
  assert.equal(decidirPorIniciales({ letras: 'XY', confianza: 0.99 }, PERSONAS).estado, 'sin_coincidencia')
  assert.equal(decidirPorIniciales({ letras: 'JC', confianza: 0.99 }, PERSONAS).estado, 'sin_entrega')
  assert.equal(distancia('EN', 'EM'), 1)
})

test('SIN INICIALES el ítem sale idéntico: ni forma de pago, ni condición, ni marca', () => {
  const porIniciales = crearPorIniciales(PERSONAS)
  const item = { comprobante: { proveedor: 'Combustibles Barcelo', formaPago: 'Efectivo', condicion: null, iniciales: null, total: 59999.94 }, postId: 'p1' }
  const antes = structuredClone(item)
  porIniciales(item)
  assert.deepEqual(item, antes)
})

test('con iniciales claras el ítem se carga «A rendir» y pagado; con dudosas, como hoy y marcado', () => {
  const porIniciales = crearPorIniciales(PERSONAS)
  const claro = { comprobante: { formaPago: 'Efectivo', condicion: null, iniciales: { letras: 'EM', confianza: 0.9 } } }
  porIniciales(claro)
  assert.equal(claro.comprobante.formaPago, 'A rendir')
  assert.equal(claro.comprobante.condicion, 'Contado')
  const dudoso = { comprobante: { formaPago: 'Efectivo', condicion: null, iniciales: { letras: 'EM', confianza: 0.5 } } }
  porIniciales(dudoso)
  assert.equal(dudoso.comprobante.formaPago, 'Efectivo')
  assert.equal(dudoso.efectivo.estado, 'pregunta')
})

test('los renglones del hilo dicen lo que pasó', () => {
  const auto = decidirPorIniciales({ letras: 'EM', confianza: 0.9 }, PERSONAS)
  assert.equal(lineaDeIniciales({ decision: auto, proveedor: 'Combustibles Barcelo', vinculado: true }),
    'Combustibles Barcelo: Imputado a Emiliano Maldonado (EM) · ER-0020 · a rendir')
  assert.match(lineaDeIniciales({ decision: decidirPorIniciales({ letras: 'JC', confianza: 0.9 }, PERSONAS) }),
    /^JC no tiene entrega abierta: cargado como compra común$/)
  assert.match(lineaDeIniciales({ decision: auto, yaEstaba: true }), /ya estaba en Compras/)
  // Letras que no son de nadie (una sigla leída como iniciales): el mensaje sale como hoy.
  assert.equal(lineaDeIniciales({ decision: decidirPorIniciales({ letras: 'SF', confianza: 0.9 }, PERSONAS), proveedor: 'Hormiserv' }), null)
  assert.equal(lineaDeIniciales({ decision: decidirPorIniciales({ letras: 'SF', confianza: 0.9 }, PERSONAS), yaEstaba: true }), null)
  const p = decidirPorIniciales({ letras: 'EN', confianza: 0.9 }, PERSONAS)
  assert.match(textoPregunta({ decision: p, proveedor: 'Hormiserv' }), /¿Es de \*\*Emiliano Maldonado \(EM\)\*\*\?/)
  assert.doesNotMatch(textoPregunta({ decision: p, proveedor: 'Hormiserv' }), /\$/)
})

test('botones: [Sí] [No] con un candidato; uno por persona + [Ninguno] con varios; ids alfanuméricos', () => {
  const uno = botonesPregunta({ id: 'i1', decision: decidirPorIniciales({ letras: 'EM', confianza: 0.4 }, PERSONAS), url: 'u' })[0].actions
  assert.deepEqual(uno.map((a) => a.name), ['Sí', 'No, compra común'])
  assert.deepEqual(uno.map((a) => a.integration.context.persona), ['pEM', null])
  const varios = botonesPregunta({ id: 'i1', decision: { letras: 'JM', candidatos: [{ persona_id: 'pEM', nombre: 'Emiliano Maldonado', iniciales: 'EM' }, { persona_id: 'pJP', nombre: 'Juan Pablo Nievas', iniciales: 'JP' }] }, url: 'u' })[0].actions
  assert.deepEqual(varios.map((a) => a.name), ['Emiliano Maldonado (EM)', 'Juan Pablo Nievas (JP)', 'Ninguno, compra común'])
  for (const a of [...uno, ...varios]) assert.match(a.id, /^[a-z0-9]+$/i)
})

test('la respuesta ESCRITA en el español del dueño', () => {
  const propuestos = [{ persona_id: 'pEM' }]
  const r = (t, prop = propuestos) => interpretarRespuesta(t, { propuestos: prop, personas: PERSONAS })
  for (const t of ['si', 'sí', 'Si!', 'dale', 'ok', 'si es de emi', 'sí, de emiliano', 'es de EM']) {
    assert.deepEqual([t, r(t).tipo, r(t).persona?.persona_id], [t, 'si', 'pEM'])
  }
  for (const t of ['no', 'No, caja chica', 'compra comun', 'no es a rendir', 'no es de emi', 'ninguno']) {
    assert.deepEqual([t, r(t).tipo], [t, 'no'])
  }
  for (const [t, quien] of [['jp', 'pJP'], ['es de JP', 'pJP'], ['de juan pablo', 'pJP'], ['no, es de juan', 'pJP'], ['emiliano', 'pEM'], ['nievas', 'pJP'], ['re', 'pRE']]) {
    assert.deepEqual([t, r(t).tipo, r(t).persona?.persona_id], [t, 'si', quien])
  }
  for (const t of ['capaz', 'no se', 'de emi o de jp', '???']) assert.equal(r(t).tipo, 'ambigua', t)
  assert.equal(r('si', [{ persona_id: 'pEM' }, { persona_id: 'pJP' }]).tipo, 'ambigua', '«si» con dos propuestas no elige')
})

function portRespuesta({ fila = {}, estadoFinal = { estado: 'si', vinculado_en: 'ya' } } = {}) {
  const q = []
  const base = { id: 'i1', estado: 'pregunta', enviado_por: 'uDueno', proveedor: 'Hormiserv', ...fila }
  return {
    q,
    async query(sql, args) {
      q.push({ sql, args })
      if (/select \* from public\.efectivo_iniciales/.test(sql)) return { rows: [base] }
      if (/select estado, vinculado_en, motivo/.test(sql)) return { rows: [estadoFinal] }
      return { rows: [] }
    },
  }
}

test('contestan quien subió el comprobante o Dirección/Administración; otro, no', async () => {
  const respuesta = { tipo: 'si', persona: { persona_id: 'pEM' } }
  const otro = portRespuesta()
  const r = await aplicarRespuesta(otro, { id: 'i1', respuesta, remitente: { perfilId: 'uOtro', rol: 'jefe_obra' }, personas: PERSONAS })
  assert.equal(r.ok, false)
  assert.ok(!otro.q.some((x) => /^\s*update/.test(x.sql)), 'no tocó nada')
  for (const remitente of [{ perfilId: 'uDueno', rol: 'jefe_obra' }, { perfilId: 'uAdm', rol: 'administracion' }]) {
    const port = portRespuesta()
    const ok = await aplicarRespuesta(port, { id: 'i1', respuesta, remitente, personas: PERSONAS })
    assert.equal(ok.texto, 'Hormiserv: Imputado a Emiliano Maldonado (EM) · ER-0020 · a rendir')
    const up = port.q.find((x) => /set estado = 'si'/.test(x.sql))
    assert.deepEqual(up.args, ['i1', 'pEM', 'e20', remitente.perfilId])
  }
})

test('«no» deja compra común; a alguien sin entrega no se imputa; una pregunta contestada no se vuelve a contestar', async () => {
  const rem = { perfilId: 'uDueno', rol: 'direccion' }
  assert.equal((await aplicarRespuesta(portRespuesta(), { id: 'i1', respuesta: { tipo: 'no' }, remitente: rem, personas: PERSONAS })).texto, 'Hormiserv: queda como compra común.')
  const jc = await aplicarRespuesta(portRespuesta(), { id: 'i1', respuesta: { tipo: 'si', persona: { persona_id: 'pJC' } }, remitente: rem, personas: PERSONAS })
  assert.match(jc.texto, /JC no tiene entrega abierta/)
  const ya = await aplicarRespuesta(portRespuesta({ fila: { estado: 'si' } }), { id: 'i1', respuesta: { tipo: 'no' }, remitente: rem, personas: PERSONAS })
  assert.equal(ya.ok, false)
  const pend = await aplicarRespuesta(portRespuesta({ estadoFinal: { estado: 'si', vinculado_en: null } }), { id: 'i1', respuesta: { tipo: 'si', persona: { persona_id: 'pEM' } }, remitente: rem, personas: PERSONAS })
  assert.match(pend.texto, /anotado para Emiliano Maldonado \(EM\) · ER-0020/)
})

test('ingesta: sólo entra la respuesta en un hilo con pregunta abierta; nunca el eco del bot', async () => {
  const canales = new Set(['ataehrdpmfyctqyjcfz5rs9jka'])
  const hilo = async (root) => root === 'raiz1'
  const info = (post) => ({ post: { channel_id: 'ataehrdpmfyctqyjcfz5rs9jka', type: '', file_ids: [], ...post }, channelName: 'compras' })
  assert.equal(await esRespuestaDePregunta(info({ root_id: 'raiz1', message: 'si es de emi', user_id: 'u' }), { botUserId: 'bot', canales, hiloConPregunta: hilo }), true)
  assert.equal(await esRespuestaDePregunta(info({ root_id: 'raiz1', message: '¿Es de EM?', user_id: 'bot' }), { botUserId: 'bot', canales, hiloConPregunta: hilo }), false)
  assert.equal(await esRespuestaDePregunta(info({ root_id: 'otra', message: 'si', user_id: 'u' }), { botUserId: 'bot', canales, hiloConPregunta: hilo }), false)
  assert.equal(await esRespuestaDePregunta(info({ root_id: '', message: 'che, cuánto le debemos', user_id: 'u' }), { botUserId: 'bot', canales, hiloConPregunta: hilo }), false)
})
