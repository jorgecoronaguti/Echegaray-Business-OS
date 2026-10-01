// Gasto o pago a subcontratista pagado con el efectivo YA ENTREGADO a una persona (dueño, 01/10/2026): se rinde
// SIN FOTO contra esa entrega por la puerta SQL `rendir_gasto_sin_foto_del_chat`. El bot no escribe en Compras en
// este camino (la fila «A rendir» la escribe el cargador de la base). Puerto doble: se ve EXACTAMENTE qué se manda.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista, registrarRendicionSinFoto, TEXTO } from './efectivo-pagos.mjs'
import { resolver } from '../director.mjs'

const actor = (root = 'post-1') => ({ plataforma_user_id: 'mm-quien', channel_id: 'ch-efectivo', root_post_id: root, plataforma: 'mattermost' })
const PERSONAS = [{ id: 'rodrigo', nombre_completo: 'SOSA RODRIGO', nombre_para_mostrar: 'Rodrigo Sosa', apodos: [] }]
const SUB = { id: 's1', obra_id: 'o-quatt', obra_nombre: 'Quattropani', proveedor_id: 'p-nasser', proveedor_texto: 'Nasser Hermanos', nombre: 'Albañilería', alcance: null, precio_contratado: 9000000 }

// Quien escribe es la persona p-yo. Las entregas de la vista: la suya (ER-0021), dos de Maldonado y una de Nievas.
const E = (id, codigo, persona_id, persona, en_su_poder, extra = {}) => ({ id, codigo, persona_id, persona, obra: null, estructura: true, en_su_poder, ...extra })
const VISTA = [
  E('e21', 'ER-0021', 'p-yo', 'GOMEZ LUIS', 300000),
  E('e30', 'ER-0030', 'p-mald', 'MALDONADO BATISTA EMILIANO MIGUEL', 500000, { obra: 'Quattropani', estructura: false }),
  E('e31', 'ER-0031', 'p-mald', 'MALDONADO BATISTA EMILIANO MIGUEL', 120000, { obra: 'Messina', estructura: false }),
  E('e40', 'ER-0040', 'p-niev', 'NIEVAS DIEGO', 700000),
]

function portFalso({ rol = 'direccion', vista = VISTA } = {}) {
  return {
    async query(sql, p) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: [{ perfil_id: 'perf-yo', persona_id: 'p-yo', es_prueba: false, nombre: 'Luis', rol }] }
      if (/from public\.efectivo_entrega_saldo/.test(sql)) {
        const solo = /persona_id = \$1/.test(sql) ? vista.filter((e) => e.persona_id === p[0]) : vista
        return { rows: solo }
      }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: vista.filter((e) => e.persona_id === 'p-yo') }
      if (/from public\.personas p/.test(sql)) return { rows: PERSONAS }
      if (/from public\.subcontrato s/.test(sql) && /join public\.obra_canonica/.test(sql)) return { rows: [SUB] }
      if (/from public\.proveedores/.test(sql)) return { rows: [{ id: 'p-nasser', nombre: 'Nasser Hermanos', razon_social: null, subcontratista: true }, { id: 'p-hormi', nombre: 'Hormiserv SA', razon_social: null, subcontratista: false }] }
      if (/from public\.obra_canonica o left join/.test(sql)) return { rows: [{ id: 'o-quatt', nombre: 'Quattropani', alias: [] }, { id: 'o-mess', nombre: 'Messina', alias: [] }] }
      if (/from public\.activo/.test(sql)) return { rows: [] }
      return { rows: [] }
    },
  }
}

const ahora = new Date('2026-10-01T15:00:00Z')
function atender(texto, o = {}) {
  const rendidas = []
  const fajos = []
  const escritos = []
  const port = o.port ?? portFalso(o)
  return especialista.atender({
    texto, port, actor: o.actor ?? actor(), commEventId: o.commEventId ?? 'ev-1', ahora,
    registrar: async () => { throw new Error('no debía pagar a una persona') },
    abrir: async (_p, f) => { fajos.push(f); return f },
    escribir: async (_c, f) => { escritos.push(f); return { texto: 'Cargado en Compras.', estado: 'cargado' } },
    rendir: o.rendir ?? (async (p) => {
      rendidas.push(p)
      const e = VISTA.find((x) => x.id === p.entrega.id)
      return { estado: 'cargado', rendicion: 'r1', fajo: 'f1', codigo: e.codigo, entrega_id: e.id, persona: e.persona, persona_id: e.persona_id, monto: p.total, en_su_poder: e.en_su_poder - p.total }
    }),
  }).then((r) => ({ r, rendidas, fajos, escritos }))
}

// Rendir contra una entrega SIEMPRE pide confirmación: el primer mensaje no escribe nada, el «sí» escribe.
async function atenderConfirmado(texto, o = {}) {
  const q = await atender(texto, o)
  if (q.r.estado !== 'pregunta_confirmar') return q
  assert.equal(q.rendidas.length + q.fajos.length + q.escritos.length, 0, 'nada se escribe antes de confirmar')
  const c = await atender('sí', o)
  return { ...c, pregunta: q.r }
}

test('Dirección: «Nievas le pagó 200.000 a Nasser con la ER-0040» rinde sin foto contra la entrega de Nievas, sin tocar Compras', async () => {
  const { r, rendidas, fajos, escritos } = await atenderConfirmado('Nievas le pagó 200.000 a Nasser con la ER-0040')
  assert.equal(rendidas.length, 1); assert.equal(fajos.length + escritos.length, 0)
  const x = rendidas[0]
  assert.equal(x.entrega.id, 'e40'); assert.equal(x.perfilId, 'perf-yo'); assert.equal(x.total, 200000)
  assert.equal(x.clave, 'chat:ev-1'); assert.equal(x.post, 'post-1')
  assert.equal(x.comprobante.proveedor, 'Nasser Hermanos'); assert.equal(x.comprobante.obra, 'Quattropani')
  assert.match(r.texto, /ER-0040/); assert.match(r.texto, /NIEVAS DIEGO|Nievas/i)
  assert.match(r.texto, /le quedan.*500\.000/i)
  assert.match(r.texto, /Compras en un minuto/i)
  assert.match(r.texto, /https?:\/\/\S+efectivo\S*por=p-niev/)
  assert.equal(r.estado, 'rendido_sin_foto')
})

test('Dirección: «pagué 50.000 de flete con la plata de Nievas» elige la entrega por el nombre del tenedor', async () => {
  const { r, rendidas } = await atenderConfirmado('pagué 50.000 de flete con la plata de Nievas')
  assert.equal(rendidas.length, 1); assert.equal(rendidas[0].entrega.id, 'e40'); assert.equal(rendidas[0].total, 50000)
  assert.match(rendidas[0].concepto, /flete/i); assert.doesNotMatch(rendidas[0].concepto, /Nievas|sin comprobante/i)
  assert.match(r.texto, /ER-0040/)
})

test('Dirección: «Nievas le pagó 80.000 de flete» (el tenedor como sujeto) ya implica la entrega, sin preguntar', async () => {
  const { rendidas } = await atenderConfirmado('Nievas le pagó 80.000 de flete')
  assert.equal(rendidas.length, 1); assert.equal(rendidas[0].entrega.id, 'e40')
})

test('Dirección con dos entregas del tenedor: pregunta cuál con lista numerada y la respuesta rinde', async () => {
  const a = actor('p-dos')
  const q = await atender('pagué 60.000 de flete con la plata de Maldonado', { actor: a })
  assert.equal(q.rendidas.length, 0); assert.equal(q.r.estado, 'pregunta_entrega')
  assert.match(q.r.texto, /1 · \*\*ER-0030\*\*.*MALDONADO.*500\.000/s); assert.match(q.r.texto, /2 · \*\*ER-0031\*\*.*120\.000/s)
  assert.equal((await especialista.reconoce('2', { area: 'rendicion', actor: a }))?.destino, 'respuesta')
  const c = await atenderConfirmado('2', { actor: a, commEventId: 'ev-2' })
  assert.equal(c.rendidas.length, 1); assert.equal(c.rendidas[0].entrega.id, 'e31'); assert.equal(c.rendidas[0].total, 60000)
  assert.equal(c.rendidas[0].clave, 'chat:ev-2')
  assert.equal(c.fajos.length, 0)
})

test('la obra del texto desempata entre las entregas del tenedor', async () => {
  const { rendidas } = await atenderConfirmado('pagué 60.000 de flete en Messina con la plata de Maldonado')
  assert.equal(rendidas[0]?.entrega.id, 'e31')
})

test('UN NO-ADMINISTRADOR NUNCA USA LA ENTREGA DE OTRO: ni por código ni por nombre, y tampoco cae en la suya', async () => {
  const port = portFalso({ rol: 'jefe_obra' })
  let x = await atender('pagué 50.000 de flete con la ER-0040', { port, actor: actor('n1') })
  assert.equal(x.rendidas.length, 0); assert.match(x.r.texto, /ER-0040\*\* es de \*\*NIEVAS DIEGO/); assert.match(x.r.texto, /No cargué nada/)
  assert.equal(x.r.estado, 'rechazado_entrega_ajena')
  x = await atender('pagué 50.000 de flete con la ER-0099', { port, actor: actor('n1b') })
  assert.equal(x.rendidas.length, 0); assert.match(x.r.texto, /No encuentro la entrega ER-0099/)
  x = await atender('Nievas le pagó 200.000 a Nasser con la ER-0040', { port, actor: actor('n2') })
  assert.equal(x.rendidas.length, 0)
  // Por nombre (auditoría 01/10/2026): antes caía en la propia; ahora se rechaza diciendo de quién es.
  x = await atender('pagué 50.000 de flete con la plata de Maldonado', { port, actor: actor('n3') })
  assert.equal(x.rendidas.length, 0); assert.equal(x.r.estado, 'rechazado_entrega_ajena'); assert.match(x.r.texto, /MALDONADO/)
  // Con sus propias, sí.
  x = await atenderConfirmado('pagué 50.000 de flete con la ER-0021', { port, actor: actor('n4') })
  assert.equal(x.rendidas[0].entrega.id, 'e21')
})

test('el no-administrador sin entrega propia no rinde nada y se le dice cómo cargarlo de la caja', async () => {
  const port = portFalso({ rol: 'jefe_obra', vista: VISTA.filter((e) => e.persona_id !== 'p-yo') })
  const x = await atender('pagué 50.000 de flete con la plata a rendir', { port, actor: actor('n5') })
  assert.equal(x.rendidas.length, 0); assert.equal(x.fajos.length, 0)
  assert.match(x.r.texto, /No cargué nada/); assert.match(x.r.texto, /caja/)
})

test('subcontratista con entrega propia y sin decir de dónde: pregunta, y «entrega» rinde con proveedor y obra', async () => {
  const a = actor('p-sub')
  const port = portFalso({ rol: 'jefe_obra' })
  const q = await atender('le pagué 500000 a Nasser por Quattropani', { port, actor: a })
  assert.equal(q.r.estado, 'pregunta_origen'); assert.match(q.r.texto, /ER-0021.*caja/); assert.equal(q.rendidas.length + q.fajos.length, 0)
  const c = await atenderConfirmado('entrega', { port, actor: a })
  assert.equal(c.rendidas.length, 1); assert.equal(c.fajos.length, 0)
  const x = c.rendidas[0]
  assert.equal(x.entrega.id, 'e21'); assert.equal(x.total, 500000)
  assert.equal(x.proveedor, 'Nasser Hermanos'); assert.equal(x.comprobante.obra, 'Quattropani')
  assert.match(c.r.texto, /Nasser/)
})

test('la respuesta puede traer el código de la entrega', async () => {
  const a = actor('p-cod')
  const q = await atender('pagué 50.000 de flete', { actor: a })
  assert.equal(q.r.estado, 'pregunta_origen')
  const c = await atenderConfirmado('con la ER-0040', { actor: a })
  assert.equal(c.rendidas[0]?.entrega.id, 'e40')
})

test('EL CAMINO DIRECTO NO CAMBIA: «de la caja» escribe la fila de Compras y no toca ninguna entrega', async () => {
  const x = await atender('pagué 50.000 de flete de la caja')
  assert.equal(x.rendidas.length, 0); assert.equal(x.fajos.length, 1)
  assert.equal(x.fajos[0].items[0].comprobante.formaPago, 'Efectivo'); assert.doesNotMatch(JSON.stringify(x.fajos[0]), /rendir/i)
  const y = await atender('le pagué 500000 a Nasser por Quattropani en efectivo de la caja', { actor: actor('d2') })
  assert.equal(y.rendidas.length, 0); assert.equal(y.fajos.length, 1)
})

test('sin migración y con error de la base: no dice que cargó', async () => {
  let x = await atenderConfirmado('pagué 50.000 de flete con la ER-0040', { rendir: async () => ({ estado: 'sin_migracion' }), actor: actor('m1') })
  assert.equal(x.r.estado, 'rechazado_sin_migracion'); assert.match(x.r.texto, /No cargué nada/)
  x = await atenderConfirmado('pagué 50.000 de flete con la ER-0040', { rendir: async () => ({ estado: 'rechazada', motivo: 'La entrega ya está cerrada.' }), actor: actor('m2') })
  assert.match(x.r.texto, /No cargué/); assert.match(x.r.texto, /cerrada/)
  x = await atenderConfirmado('pagué 50.000 de flete con la ER-0040', { rendir: async () => { throw new Error('boom') }, actor: actor('m3') })
  assert.equal(x.r.estado, 'error'); assert.doesNotMatch(x.r.texto, /cargado|rendido/i)
})

test('ya estaba cargado: lo dice y no duplica', async () => {
  const x = await atenderConfirmado('pagué 50.000 de flete con la ER-0040', {
    actor: actor('y1'),
    rendir: async () => ({ estado: 'ya_estaba', rendicion: 'r1', fajo: 'f1', codigo: 'ER-0040', entrega_id: 'e40', persona: 'NIEVAS DIEGO', persona_id: 'p-niev', monto: 50000, en_su_poder: 650000 }),
  })
  assert.equal(x.r.estado, 'ya_estaba'); assert.match(x.r.texto, /ya estaba cargado/i)
})

test('el Director manda estas frases al especialista de efectivo-pagos', async () => {
  const port = portFalso()
  for (const texto of ['Nievas le pagó 200.000 a Nasser con la ER-0040', 'pagué 50.000 de flete con la plata de Maldonado']) {
    const r = await resolver({ texto, port, channelId: 'ch-efectivo', actor: actor() })
    assert.equal(r.especialista?.slug, 'efectivo-pagos', texto)
  }
})

// ───── BENEFICIARIO ≠ TENEDOR, y nada se rinde sin confirmar (auditor, 01/10/2026) ─────

test('«Pagué con efectivo a Tello 50.000»: Tello es a quien se le pagó; sin origen dicho, pregunta caja o entrega', async () => {
  for (const [rol, a] of [['jefe_obra', actor('b1')], ['direccion', actor('b2')]]) {
    const port = portFalso({ rol })
    const q = await atender('Pagué con efectivo a Tello 50.000', { port, actor: a })
    assert.equal(q.r.estado, 'pregunta_origen', rol); assert.equal(q.rendidas.length + q.fajos.length, 0, rol)
    // Un jefe con UNA sola entrega abierta: ni así se escribe sin confirmar, y la confirmación nombra a Tello.
    const c = await atender('entrega', { port, actor: a })
    assert.equal(c.r.estado, 'pregunta_confirmar', rol); assert.equal(c.rendidas.length, 0, rol)
    assert.match(c.r.texto, /50\.000/); assert.match(c.r.texto, /Tello/); assert.match(c.r.texto, /ER-0021/); assert.match(c.r.texto, /GOMEZ LUIS/)
    const s = await atender('sí', { port, actor: a })
    assert.equal(s.rendidas.length, 1, rol); assert.equal(s.rendidas[0].entrega.id, 'e21'); assert.match(s.rendidas[0].concepto, /Tello/)
  }
})

test('«pague 50000 con efectivo a Hormiserv por hormigon»: el proveedor no se pierde; de la caja va a Compras con Hormiserv', async () => {
  const a = actor('b3')
  const q = await atender('pague 50000 con efectivo a Hormiserv por hormigon', { actor: a })
  assert.equal(q.r.estado, 'pregunta_origen'); assert.equal(q.rendidas.length + q.fajos.length, 0)
  const c = await atender('caja', { actor: a })
  assert.equal(c.rendidas.length, 0); assert.equal(c.fajos.length, 1)
  assert.equal(c.fajos[0].items[0].comprobante.proveedor, 'Hormiserv SA')
  assert.match(c.fajos[0].items[0].comprobante.concepto, /Hormiserv por hormigon/)
})

test('«pagué en efectivo a Juan Pérez 30000 por flete»: pregunta el origen, no adivina una entrega', async () => {
  const q = await atender('pagué en efectivo a Juan Pérez 30000 por flete', { actor: actor('b4'), port: portFalso({ rol: 'jefe_obra' }) })
  assert.equal(q.r.estado, 'pregunta_origen'); assert.equal(q.rendidas.length + q.fajos.length, 0)
})

test('«pagué 50000 a Tello con el efectivo de Maldonado»: la entrega es de Maldonado, el beneficiario Tello', async () => {
  const a = actor('b5')
  const q = await atender('pagué 50000 a Tello con el efectivo de Maldonado', { actor: a })
  assert.equal(q.r.estado, 'pregunta_entrega'); assert.match(q.r.texto, /ER-0030/); assert.match(q.r.texto, /ER-0031/); assert.doesNotMatch(q.r.texto, /ER-0021|ER-0040/)
  const c = await atenderConfirmado('1', { actor: a, commEventId: 'ev-b5' })
  assert.match(c.pregunta.texto, /Tello/); assert.match(c.pregunta.texto, /ER-0030/); assert.match(c.pregunta.texto, /MALDONADO/)
  assert.equal(c.rendidas.length, 1); assert.equal(c.rendidas[0].entrega.id, 'e30'); assert.equal(c.rendidas[0].total, 50000)
  assert.match(c.rendidas[0].concepto, /a Tello/); assert.doesNotMatch(c.rendidas[0].concepto, /Maldonado/i)
})

test('«gasté 12000 de mi entrega en nafta»: rinde contra la propia, después de confirmar', async () => {
  const c = await atenderConfirmado('gasté 12000 de mi entrega en nafta', { actor: actor('b6'), port: portFalso({ rol: 'jefe_obra' }) })
  assert.equal(c.pregunta?.estado, 'pregunta_confirmar'); assert.match(c.pregunta.texto, /12\.000/); assert.match(c.pregunta.texto, /nafta/); assert.match(c.pregunta.texto, /ER-0021/)
  assert.equal(c.rendidas.length, 1); assert.equal(c.rendidas[0].entrega.id, 'e21'); assert.match(c.rendidas[0].concepto, /^gasté 12000 en nafta$/)
})

test('«pagué 20.000 de la ER-0021 a Corralón»: confirma nombrando a Corralón y la ER-0021; «no» no escribe nada', async () => {
  const a = actor('b7')
  const port = portFalso({ rol: 'jefe_obra' })
  const q = await atender('pagué 20.000 de la ER-0021 a Corralón', { port, actor: a })
  assert.equal(q.r.estado, 'pregunta_confirmar'); assert.equal(q.rendidas.length, 0)
  assert.match(q.r.texto, /20\.000/); assert.match(q.r.texto, /Corralón/); assert.match(q.r.texto, /ER-0021/)
  const r = await atender('qué', { port, actor: a })
  assert.equal(r.rendidas.length, 0); assert.match(r.r.texto, /ER-0021/)
  const n = await atender('no', { port, actor: a })
  assert.equal(n.rendidas.length + n.fajos.length, 0); assert.equal(n.r.estado, 'cancelado')
  assert.equal((await especialista.reconoce('sí', { area: 'rendicion', actor: a })), null, 'la pregunta se cerró')
})

// ───── la escritura, con relectura en el destino ─────
const ENT = { id: 'e40', codigo: 'ER-0040' }
const args = (port) => ({ port, entrega: ENT, perfilId: 'perf-yo', fecha: '2026-10-01', total: 200000, concepto: 'flete', proveedor: 'Nasser Hermanos', comprobante: { proveedor: 'Nasser Hermanos' }, clave: 'chat:ev-1', post: 'post-1' })
const RES = { ya_estaba: false, rendicion: 'r1', fajo: 'f1', codigo: 'ER-0040', entrega_id: 'e40', persona: 'NIEVAS DIEGO', monto: 200000, en_su_poder: 999 }
function portDeEscritura({ rpc, rendiciones = 1, fajo = 'pendiente', saldo = 500000 } = {}) {
  const calls = []
  return {
    calls,
    async query(sql, p) {
      calls.push({ sql, p })
      if (/rendir_gasto_sin_foto_del_chat/.test(sql)) return rpc(p)
      if (/from public\.efectivo_rendicion/.test(sql)) return { rows: [{ n: rendiciones }] }
      if (/from comunicacion\.comprobante_fajos/.test(sql)) return { rows: fajo == null ? [] : [{ estado: fajo }] }
      if (/from public\.efectivo_entrega_saldo/.test(sql)) return { rows: [{ en_su_poder: saldo, persona_id: 'p-niev' }] }
      return { rows: [] }
    },
  }
}

test('registrarRendicionSinFoto: manda los 9 parámetros en orden, relee destino y el saldo sale de la base', async () => {
  const port = portDeEscritura({ rpc: () => ({ rows: [{ r: RES }] }) })
  const r = await registrarRendicionSinFoto(args(port))
  assert.equal(r.estado, 'cargado'); assert.equal(r.en_su_poder, 500000)
  const llamada = port.calls.find((c) => /rendir_gasto_sin_foto_del_chat/.test(c.sql))
  assert.deepEqual(llamada.p.slice(0, 2), ['perf-yo', 'e40']); assert.equal(llamada.p[2], '2026-10-01'); assert.equal(llamada.p[3], 200000)
  assert.equal(llamada.p[4], 'flete'); assert.equal(llamada.p[5], 'Nasser Hermanos'); assert.equal(llamada.p[7], 'chat:ev-1'); assert.equal(llamada.p[8], 'post-1')
  assert.equal(llamada.p.length, 9)
})

test('registrarRendicionSinFoto: si la base no muestra la rendición o el fajo, falla', async () => {
  await assert.rejects(registrarRendicionSinFoto(args(portDeEscritura({ rpc: () => ({ rows: [{ r: RES }] }), rendiciones: 0 }))), /la base no muestra/)
  await assert.rejects(registrarRendicionSinFoto(args(portDeEscritura({ rpc: () => ({ rows: [{ r: RES }] }), fajo: null }))), /la base no muestra/)
})

test('registrarRendicionSinFoto: sin migración, sin permiso, regla de negocio y un reintento por 40001', async () => {
  const err = (code, message = 'x') => () => { const e = new Error(message); e.code = code; throw e }
  assert.deepEqual(await registrarRendicionSinFoto(args(portDeEscritura({ rpc: err('42883') }))), { estado: 'sin_migracion' })
  assert.deepEqual(await registrarRendicionSinFoto(args(portDeEscritura({ rpc: err('42P01') }))), { estado: 'sin_migracion' })
  assert.equal((await registrarRendicionSinFoto(args(portDeEscritura({ rpc: err('42501') })))).estado, 'sin_permiso')
  const n = await registrarRendicionSinFoto(args(portDeEscritura({ rpc: err('P0001', 'ERROR: La entrega está cerrada.') })))
  assert.equal(n.estado, 'rechazada'); assert.match(n.motivo, /cerrada/); assert.doesNotMatch(n.motivo, /ERROR:/)
  let i = 0
  const r = await registrarRendicionSinFoto(args(portDeEscritura({ rpc: () => { if (i++ === 0) { const e = new Error('s'); e.code = '40001'; throw e } return { rows: [{ r: RES }] } } })))
  assert.equal(r.estado, 'cargado'); assert.equal(i, 2)
  await assert.rejects(registrarRendicionSinFoto(args(portDeEscritura({ rpc: err('40001') }))))
})

test('TEXTO.SIN_MIGRACION_ENTREGA existe y no promete haber cargado', () => {
  assert.match(TEXTO.SIN_MIGRACION_ENTREGA, /No cargué nada/)
})
