// Entregar efectivo escribiéndolo en el canal de comprobantes (22/09/2026).
//
// Lo que se prueba: que NO registre cuando no está seguro, que el canal y el permiso fallen cerrado, y que
// lo que se registra sea exactamente lo que dice el mensaje. Es plata saliendo del cajón.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista, textoRegistrada, TEXTO } from './entregas-efectivo.mjs'

const actor = { plataforma_user_id: 'mm1', channel_id: 'ch1' }
const PERSONAS = [
  { id: 'sosa', nombre: 'SOSA RUBEN DARIO' },
  { id: 'sosa2', nombre: 'SOSA MARIA ELENA' },
  { id: 'aguero', nombre: 'AGUERO CRISTIAN DOMINGO' },
]
const OBRAS = [{ id: 'g8', codigo: 'OB-0020', nombre: 'Galpón 8' }]

function portFalso({ canal = true, perfil = 'perf-1' } = {}) {
  const q = []
  return {
    q,
    async query(sql) {
      q.push(sql)
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ canal_nombre: 'Comprobantes-gastos' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: perfil ? [{ perfil_id: perfil, rol: 'administracion', nombre: 'Quien Sea' }] : [] }
      if (/from public\.personas/.test(sql)) return { rows: PERSONAS }
      if (/from public\.obra_canonica/.test(sql)) return { rows: OBRAS }
      return { rows: [] }
    },
  }
}

test('reclama lo que dice que se entregó plata, y no una factura ni una foto', async () => {
  assert.equal((await especialista.reconoce('entregué $250.000 a Sosa', { area: 'rendicion' }))?.destino, 'entregar')
  assert.equal(await especialista.reconoce('la factura 0001-00012345 de Acindar', { area: 'rendicion' }), null)
  assert.equal(await especialista.reconoce('entregué $250.000 a Sosa', { area: 'rendicion', fileIds: ['f1'] }), null,
    'con foto manda el comprobante, no el texto')
  assert.equal(await especialista.reconoce('entregué $250.000 a Sosa', { area: 'compras' }), null,
    'en Comprobantes-gastos no se entrega efectivo')
})

test('registra lo que dice el mensaje: monto, persona, obra y quién la entregó', async () => {
  const pedidos = []
  const r = await especialista.atender({
    texto: 'entregue 250 mil a sosa ruben dario p/ el galpon 8', port: portFalso(), actor,
    entregar: async (p) => { pedidos.push(p); return 'ER-0003' },
  })
  assert.deepEqual(pedidos[0], {
    perfilId: 'perf-1', persona: 'sosa', obra: 'g8', estructura: false, monto: 250000, paraQue: 'galpon 8',
  })
  assert.equal(r.estado, 'entregada')
  assert.match(r.texto, /ER-0003/)
  assert.match(r.texto, /SOSA RUBEN DARIO/)
})

test('sin obra nombrada va a Estructura con el destino escrito', async () => {
  const pedidos = []
  await especialista.atender({
    texto: 'le di $30.000 a aguero para gasoil', port: portFalso(), actor,
    entregar: async (p) => { pedidos.push(p); return 'ER-0004' },
  })
  assert.equal(pedidos[0].estructura, true)
  assert.equal(pedidos[0].obra, null)
  assert.equal(pedidos[0].paraQue, 'gasoil')
})

test('ante la duda NO registra: pregunta y no llama a la base', async () => {
  for (const [texto, estado] of [
    ['entregué $10.000 a sosa para el galpón 8', 'pregunta_persona_ambigua'],
    // El número del galpón no es plata: pregunta el monto en vez de registrar $ 8.
    ['entregué plata a aguero para el galpón 8', 'pregunta_monto'],
    ['entregué $10.000 a aguero', 'pregunta_destino'],
    ['entregué $10.000 a quien sea para el galpón 8', 'pregunta_persona'],
  ]) {
    let llamo = false
    const r = await especialista.atender({
      texto, port: portFalso(), actor, entregar: async () => { llamo = true; return 'ER-9999' },
    })
    assert.equal(r.estado, estado, texto)
    assert.equal(llamo, false, `${texto}: no puede escribir sin estar seguro`)
  }
})

test('las puertas fallan cerrado: canal ajeno y usuario sin perfil', async () => {
  const ajeno = await especialista.atender({ texto: 'entregué $10.000 a aguero para gasoil', port: portFalso({ canal: false }), actor, entregar: async () => 'X' })
  assert.equal(ajeno.estado, 'rechazado_canal')
  const sinPerfil = await especialista.atender({ texto: 'entregué $10.000 a aguero para gasoil', port: portFalso({ perfil: null }), actor, entregar: async () => 'X' })
  assert.equal(sinPerfil.estado, 'rechazado_sin_perfil')
})

test('el permiso lo decide la base, y su negativa se traduce sin inventar otra cosa', async () => {
  const r = await especialista.atender({
    texto: 'entregué $10.000 a aguero para gasoil', port: portFalso(), actor,
    entregar: async () => { throw new Error('entregar y recibir efectivo es de Dirección, Administración o Jefe de obra') },
  })
  assert.equal(r.estado, 'rechazado_permiso')
  assert.equal(r.texto, TEXTO.SIN_PERMISO)
})

test('la respuesta del canal no publica saldos de nadie', () => {
  const t = textoRegistrada({ codigo: 'ER-0003', monto: 250000, persona: 'SOSA RUBEN DARIO', destino: 'Galpón 8' })
  assert.match(t, /ER-0003/)
  assert.equal((t.match(/\$/g) ?? []).length, 1, 'sólo el monto de ESTA entrega')
  assert.doesNotMatch(t, /saldo|en su poder|le queda/i)
})

// ═══ LA FOTO DEL VALE (22/09/2026) ═══

import { atenderVale, RE_VALE } from './entregas-efectivo.mjs'

const mmConFoto = {}
const bajarFalso = async () => ({ ok: true, fileId: 'f1', nombre: 'vale.jpg', mediaType: 'image/jpeg', data: 'eA==' })

test('sólo se mira la foto si el mensaje dice que es un vale: una factura no paga una lectura de más', async () => {
  let miro = false
  const r = await atenderVale({
    texto: 'factura de Acindar', port: portFalso(), actor, mattermost: mmConFoto, fileIds: ['f1'], bajar: bajarFalso,
    leer: async () => { miro = true; return { ok: true, vale: { esVale: true, monto: 1000 } } },
  })
  assert.equal(r, null)
  assert.equal(miro, false)
  assert.ok(RE_VALE.test('vale de $25.000'))
  assert.ok(RE_VALE.test('entregue este vale'))
  assert.equal(RE_VALE.test('factura de acindar'), false)
})

test('si el papel resulta ser una factura, la foto sigue su camino de comprobante', async () => {
  const r = await atenderVale({
    texto: 'vale de entrega', port: portFalso(), actor, mattermost: mmConFoto, fileIds: ['f1'], bajar: bajarFalso,
    leer: async () => ({ ok: true, vale: { esVale: false, monto: 32000, persona: null, paraQue: null, fecha: null } }),
  })
  assert.equal(r, null, 'devuelve null para que el circuito de comprobantes la cargue')
})

test('el vale leído se registra con el papel como conformidad', async () => {
  const pedidos = []
  const r = await atenderVale({
    texto: 'vale firmado', port: portFalso(), actor, mattermost: mmConFoto, fileIds: ['f1'], bajar: bajarFalso,
    leer: async () => ({ ok: true, vale: { esVale: true, monto: 25000, persona: 'AGUERO CRISTIAN', paraQue: 'gasoil', fecha: '2026-09-22', firmado: true } }),
    guardarVale: async (p) => { pedidos.push(p); return { codigo: 'ER-0005', papel: true } },
  })
  assert.equal(pedidos[0].persona, 'aguero')
  assert.equal(pedidos[0].monto, 25000)
  assert.equal(pedidos[0].estructura, true)
  assert.equal(pedidos[0].fecha, '2026-09-22')
  assert.equal(r.estado, 'entregada_con_vale')
  assert.match(r.texto, /ER-0005/)
  assert.match(r.texto, /conformidad en papel/)
})

test('el vale sin importe legible NO se registra: se pide el importe', async () => {
  let guardo = false
  const r = await atenderVale({
    texto: 'vale', port: portFalso(), actor, mattermost: mmConFoto, fileIds: ['f1'], bajar: bajarFalso,
    leer: async () => ({ ok: true, vale: { esVale: true, monto: null, persona: 'AGUERO CRISTIAN', paraQue: 'gasoil' } }),
    guardarVale: async () => { guardo = true; return { codigo: 'X', papel: true } },
  })
  assert.equal(r.estado, 'pregunta_monto')
  assert.equal(guardo, false)
})

test('si la foto no se pudo guardar, se dice: la entrega quedó sin su papel', async () => {
  const r = await atenderVale({
    texto: 'vale', port: portFalso(), actor, mattermost: mmConFoto, fileIds: ['f1'], bajar: bajarFalso,
    leer: async () => ({ ok: true, vale: { esVale: true, monto: 25000, persona: 'AGUERO', paraQue: 'gasoil' } }),
    guardarVale: async () => ({ codigo: 'ER-0006', papel: false }),
  })
  assert.match(r.texto, /sin el papel/)
})
