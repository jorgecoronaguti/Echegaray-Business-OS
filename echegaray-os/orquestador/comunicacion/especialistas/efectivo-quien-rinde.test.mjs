// QUIÉN RINDE Y CONTRA QUÉ ENTREGA, POR EL CHAT (auditoría 01/10/2026, dos bloqueantes).
//
// Regla del dueño (01/10/2026, literal): «solo los usuarios con nivel jefe de obra y admin, rinden gastos y admin
// tiene abm de efectivo». El jefe de obra rinde lo de SU entrega; Dirección y Administración, lo de cualquiera.
// Un `campo` con una entrega la ve y la firma: no rinde.
//
//   1. TODO camino que descuenta de una entrega (gasto, subcontrato, pago a cuenta de sueldo / adelanto) resuelve
//      la entrega con la misma regla y pide el «sí» mostrando importe, concepto, beneficiario, código y tenedor.
//   2. Un `campo` no rinde por el chat.
//
// Puerto doble: se ve exactamente qué se escribiría; nada toca la base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista as pagos } from './efectivo-pagos.mjs'
import { especialista as adelantos } from './adelantos-sueldo.mjs'

// Nievas y Maldonado también están en el padrón: nombrarlos como tenedores no los vuelve beneficiarios.
const PERSONAS = [
  { id: 'rodrigo', nombre_completo: 'SOSA RODRIGO', nombre_para_mostrar: 'Rodrigo Sosa', apodos: [] },
  { id: 'nievas', nombre_completo: 'NIEVAS DIEGO', nombre_para_mostrar: 'Diego Nievas', apodos: [] },
  { id: 'maldonado', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado', apodos: [] },
]
const E = (id, codigo, persona_id, persona, en_su_poder, extra = {}) => ({ id, codigo, persona_id, persona, obra: null, estructura: true, es_prueba: false, en_su_poder, ...extra })
// Quien escribe es la persona p-yo (GOMEZ LUIS), con la ER-0021. Maldonado tiene dos; Nievas una.
const VISTA = [
  E('e21', 'ER-0021', 'p-yo', 'GOMEZ LUIS', 300000),
  E('e30', 'ER-0030', 'p-mald', 'MALDONADO BATISTA EMILIANO MIGUEL', 500000, { obra: 'Quattropani', estructura: false }),
  E('e31', 'ER-0031', 'p-mald', 'MALDONADO BATISTA EMILIANO MIGUEL', 120000, { obra: 'Messina', estructura: false }),
  E('e40', 'ER-0040', 'p-niev', 'NIEVAS DIEGO', 700000),
]

function portFalso({ rol, vista = VISTA } = {}) {
  return {
    async query(sql, p) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: [{ perfil_id: 'perf-yo', persona_id: 'p-yo', es_prueba: false, nombre: 'Luis', rol }] }
      if (/from public\.efectivo_entrega_saldo/.test(sql)) {
        return { rows: /persona_id = \$1/.test(sql) ? vista.filter((e) => e.persona_id === p[0]) : vista }
      }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: vista.filter((e) => e.persona_id === 'p-yo') }
      if (/from public\.personas p/.test(sql)) return { rows: PERSONAS }
      return { rows: [] }
    },
  }
}

let n = 0
const actor = () => ({ plataforma_user_id: 'mm-quien', channel_id: 'ch-efectivo', root_post_id: `hilo-${++n}`, plataforma: 'mattermost' })
const ahora = new Date('2026-10-01T15:00:00Z')
const CARGADO = { estado: 'cargado', codigo: null, desde: '2026-10-01', hasta: '2026-10-15', grupo: 'obreros', pagada: false }

/** Todo lo que se habría escrito, por cualquier puerta. */
function espias() {
  const s = { adelantos: [], pagosCaja: [], rendidas: [], fajos: [] }
  s.adelantar = async (p) => { s.adelantos.push(p); return { ...CARGADO, codigo: p.entrega.codigo } }
  s.registrar = async (p) => { s.pagosCaja.push(p); return CARGADO }
  s.rendir = async (p) => { s.rendidas.push(p); return { estado: 'cargado', codigo: p.entrega.codigo, persona: p.entrega.persona, persona_id: p.entrega.persona_id, monto: p.total, en_su_poder: 1 } }
  s.abrir = async (_p, f) => { s.fajos.push(f); return f }
  s.escribir = async () => ({ texto: 'Cargado en Compras.', estado: 'cargado' })
  s.total = () => s.adelantos.length + s.pagosCaja.length + s.rendidas.length + s.fajos.length
  return s
}

const enPagos = (texto, { rol, a, ev, s }) => pagos.atender({
  texto, port: portFalso({ rol }), actor: a, commEventId: ev, ahora,
  registrar: s.registrar, adelantar: s.adelantar, rendir: s.rendir, abrir: s.abrir, escribir: s.escribir,
})
const enAdelantos = (texto, { rol, a, ev, s }) => adelantos.atender({
  texto, port: portFalso({ rol }), actor: a, commEventId: ev, ahora, registrar: s.adelantar, registrarDirecto: s.registrar,
})

// ───── BLOQUEANTE 1 · el pago a cuenta de sueldo con plata de una entrega ─────

test('jefe «le pagué 30000 a Rodrigo Sosa de mi entrega»: NO escribe sin el «sí», y la pregunta dice importe, concepto, beneficiario, ER y tenedor', async () => {
  const s = espias(); const a = actor()
  const q = await enPagos('le pagué 30000 a Rodrigo Sosa de mi entrega', { rol: 'jefe_obra', a, ev: 'ev-j1', s })
  assert.equal(q.estado, 'pregunta_confirmar'); assert.equal(s.total(), 0, 'nada escrito antes del sí')
  assert.match(q.texto, /30\.000/); assert.match(q.texto, /Rodrigo Sosa/); assert.match(q.texto, /ER-0021/); assert.match(q.texto, /GOMEZ LUIS/)
  assert.match(q.texto, /Concepto: .*sueldo/i); assert.match(q.texto, /\*\*sí\*\* o \*\*no\*\*/)
  assert.equal((await pagos.reconoce('sí', { area: 'rendicion', actor: a }))?.destino, 'respuesta')
  const c = await enPagos('sí', { rol: 'jefe_obra', a, ev: 'ev-j1-si', s })
  assert.equal(s.adelantos.length, 1); assert.equal(s.total(), 1)
  const x = s.adelantos[0]
  assert.equal(x.entrega.id, 'e21'); assert.equal(x.persona.id, 'rodrigo'); assert.equal(x.importe, 30000)
  assert.equal(x.clave, 'adelanto:ev-j1', 'la clave es la del mensaje del pago, no la del «sí»'); assert.equal(x.perfilId, 'perf-yo')
  assert.equal(c.estado, 'adelanto_cargado')
})

test('jefe: «no» a la confirmación no escribe nada', async () => {
  const s = espias(); const a = actor()
  await enPagos('le pagué 30000 a Rodrigo Sosa de mi entrega', { rol: 'jefe_obra', a, ev: 'ev-j2', s })
  const c = await enPagos('no', { rol: 'jefe_obra', a, ev: 'ev-j2-no', s })
  assert.equal(c.estado, 'cancelado'); assert.equal(s.total(), 0)
})

test('Dirección «le pagué 50000 a Rodrigo de lo que le di a Nievas»: confirma contra la ER-0040 de Nievas, nunca la propia', async () => {
  const s = espias(); const a = actor()
  const q = await enPagos('le pagué 50000 a Rodrigo de lo que le di a Nievas', { rol: 'direccion', a, ev: 'ev-d1', s })
  assert.equal(q.estado, 'pregunta_confirmar'); assert.equal(s.total(), 0)
  assert.match(q.texto, /ER-0040/); assert.match(q.texto, /NIEVAS DIEGO/); assert.doesNotMatch(q.texto, /ER-0021|GOMEZ/)
  assert.match(q.texto, /50\.000/); assert.match(q.texto, /Rodrigo Sosa/)
  await enPagos('sí', { rol: 'direccion', a, ev: 'ev-d1-si', s })
  assert.equal(s.adelantos.length, 1); assert.equal(s.adelantos[0].entrega.id, 'e40'); assert.equal(s.adelantos[0].persona.id, 'rodrigo')
})

test('Dirección que nombra a un tenedor sin entrega abierta: se rechaza, no cae en la propia', async () => {
  const s = espias(); const a = actor()
  const r = await enPagos('le pagué 50000 a Rodrigo con la plata de Pereyra', { rol: 'direccion', a, ev: 'ev-d2', s })
  assert.equal(r.estado, 'rechazado_tenedor_sin_entrega'); assert.equal(s.total(), 0)
  assert.match(r.texto, /pereyra/i); assert.match(r.texto, /No cargué nada/)
})

test('JEFE QUE NOMBRA LA ENTREGA DE OTRO: se rechaza diciendo por qué, sin caer en la suya y sin dejar nada abierto', async () => {
  const casos = [
    ['le pagué 50000 a Rodrigo de lo que le di a Nievas', /NIEVAS|Nievas/],
    ['pagué 50.000 de flete con la plata de Maldonado', /MALDONADO|Maldonado/],
    ['pagué 50.000 de flete con la ER-0040', /ER-0040.*NIEVAS/s],
    ['le pagué 30000 a Rodrigo con la ER-0030', /ER-0030.*MALDONADO/s],
    ['Nievas le pagó 200.000 a Nasser', /NIEVAS|Nievas/],
  ]
  for (const [texto, quien] of casos) {
    const s = espias(); const a = actor()
    const r = await enPagos(texto, { rol: 'jefe_obra', a, ev: `ev-${n}`, s })
    assert.equal(r.estado, 'rechazado_entrega_ajena', texto); assert.equal(s.total(), 0, texto)
    assert.match(r.texto, quien, texto); assert.match(r.texto, /Dirección y Administración/, texto); assert.match(r.texto, /No cargué nada/, texto)
    assert.equal(await pagos.reconoce('sí', { area: 'rendicion', actor: a }), null, `${texto}: no quedó nada para confirmar`)
  }
})

test('el jefe que nombra SU propia plata o su obra sigue rindiendo lo suyo (con confirmación)', async () => {
  for (const texto of ['pagué 20000 de flete con la plata de Gomez', 'pagué 20000 de flete con la ER-0021']) {
    const s = espias(); const a = actor()
    const q = await enPagos(texto, { rol: 'jefe_obra', a, ev: `ev-${n}`, s })
    assert.equal(q.estado, 'pregunta_confirmar', texto); assert.match(q.texto, /ER-0021/, texto)
    await enPagos('sí', { rol: 'jefe_obra', a, ev: `ev-${n}-si`, s })
    assert.equal(s.rendidas.length, 1, texto); assert.equal(s.rendidas[0].entrega.id, 'e21', texto)
  }
})

// El adelanto escrito como tal lo reclama `adelantos-sueldo` (gana por «adelanto»): es el MISMO camino.
test('adelantos-sueldo, jefe con entrega: «le di 8500 de adelanto a Rodrigo» pide el «sí» y recién ahí rinde de la suya', async () => {
  const s = espias(); const a = actor()
  const q = await enAdelantos('le di 8500 de adelanto a Rodrigo', { rol: 'jefe_obra', a, ev: 'ev-a1', s })
  assert.equal(q.estado, 'pregunta_confirmar'); assert.equal(s.total(), 0)
  assert.match(q.texto, /8\.500/); assert.match(q.texto, /Rodrigo Sosa/); assert.match(q.texto, /ER-0021/); assert.match(q.texto, /GOMEZ LUIS/)
  const c = await enPagos('sí', { rol: 'jefe_obra', a, ev: 'ev-a1-si', s })
  assert.equal(c.estado, 'adelanto_cargado')
  assert.equal(s.adelantos.length, 1); assert.equal(s.adelantos[0].entrega.id, 'e21'); assert.equal(s.adelantos[0].clave, 'adelanto:ev-a1')
})

test('adelantos-sueldo, Dirección «le di 50000 de adelanto a Rodrigo de lo que le di a Nievas»: la de Nievas, confirmada', async () => {
  const s = espias(); const a = actor()
  const q = await enAdelantos('le di 50000 de adelanto a Rodrigo de lo que le di a Nievas', { rol: 'direccion', a, ev: 'ev-a2', s })
  assert.equal(q.estado, 'pregunta_confirmar'); assert.equal(s.total(), 0)
  assert.match(q.texto, /ER-0040/); assert.doesNotMatch(q.texto, /ER-0021/)
  await enPagos('sí', { rol: 'direccion', a, ev: 'ev-a2-si', s })
  assert.equal(s.adelantos[0]?.entrega.id, 'e40')
})

test('adelantos-sueldo, jefe que nombra la plata de otro: rechazado, sin caer en la suya ni en la caja', async () => {
  const s = espias(); const a = actor()
  const r = await enAdelantos('le di 50000 de adelanto a Rodrigo de lo que le di a Nievas', { rol: 'jefe_obra', a, ev: 'ev-a3', s })
  assert.equal(r.estado, 'rechazado_entrega_ajena'); assert.equal(s.total(), 0)
})

// ───── BLOQUEANTE 2 · un `campo` no rinde por el chat ─────

test('CAMPO con entrega: ni gasto, ni pago a cuenta, ni subcontrato de su entrega; se le dice que lo rinde Administración', async () => {
  for (const texto of ['gasté 12000 de mi entrega en nafta', 'le pagué 30000 a Rodrigo Sosa de mi entrega', 'pagué 50.000 de flete con la ER-0021']) {
    const s = espias(); const a = actor()
    const r = await enPagos(texto, { rol: 'campo', a, ev: `ev-${n}`, s })
    assert.equal(r.estado, 'rechazado_no_rinde', texto); assert.equal(s.total(), 0, texto)
    assert.match(r.texto, /Administración/, texto); assert.match(r.texto, /No cargué nada/, texto)
    assert.equal(await pagos.reconoce('sí', { area: 'rendicion', actor: a }), null, texto)
  }
})

test('CAMPO con entrega que contesta «entrega» a «¿de la caja o de la entrega?»: no rinde', async () => {
  const s = espias(); const a = actor()
  const q = await enPagos('pagué 50.000 de flete', { rol: 'campo', a, ev: 'ev-c1', s })
  assert.equal(q.estado, 'pregunta_origen')
  const r = await enPagos('entrega', { rol: 'campo', a, ev: 'ev-c1-r', s })
  assert.equal(r.estado, 'rechazado_no_rinde'); assert.equal(s.total(), 0)
})

test('CAMPO con entrega que pide un adelanto (adelantos-sueldo): no rinde ni lo pasa a la caja', async () => {
  const s = espias(); const a = actor()
  const r = await enAdelantos('le di 8500 de adelanto a Rodrigo', { rol: 'campo', a, ev: 'ev-c2', s })
  assert.equal(r.estado, 'rechazado_no_rinde'); assert.equal(s.total(), 0)
  assert.match(r.texto, /Administración/)
})

test('sin rol legible (fail-closed): tampoco rinde', async () => {
  const s = espias(); const a = actor()
  const r = await enPagos('gasté 12000 de mi entrega en nafta', { rol: null, a, ev: 'ev-x1', s })
  assert.equal(r.estado, 'rechazado_no_rinde'); assert.equal(s.total(), 0)
})

// ───── AUDITORÍA DE CIERRE 01/10 · las dos puertas que escribían SIN entrega: pago con la caja y gasto a Compras ─────
const conPuerto = (esp, texto, { port, a, ev, s }) => esp.atender({
  texto, port, actor: a, commEventId: ev, ahora,
  registrar: esp === pagos ? s.registrar : s.adelantar, registrarDirecto: s.registrar,
  adelantar: s.adelantar, rendir: s.rendir, abrir: s.abrir, escribir: s.escribir,
})

test('CAMPO «de la caja»: ni el pago a cuenta (Liquidación) ni el gasto sin ticket (Compras); se le dice quién lo carga', async () => {
  for (const texto of ['le pagué 30000 a Rodrigo Sosa de la caja', 'pagué 50.000 de gasoil de la caja']) {
    const s = espias(); const a = actor()
    const r = await enPagos(texto, { rol: 'campo', a, ev: `ev-k${n}`, s })
    assert.equal(r.estado, 'rechazado_no_rinde', texto); assert.equal(s.total(), 0, texto)
    assert.match(r.texto, /No cargué nada/, texto); assert.match(r.texto, /Administración/, texto)
  }
})

test('CAMPO con entrega que contesta «caja» a «¿de la caja o de la entrega?»: tampoco escribe', async () => {
  for (const texto of ['pagué 50.000 de flete', 'le pagué 30000 a Rodrigo Sosa']) {
    const s = espias(); const a = actor()
    const q = await enPagos(texto, { rol: 'campo', a, ev: `ev-q${n}`, s })
    assert.equal(q.estado, 'pregunta_origen', texto)
    const r = await enPagos('de la caja', { rol: 'campo', a, ev: `ev-q${n}-r`, s })
    assert.equal(r.estado, 'rechazado_no_rinde', texto); assert.equal(s.total(), 0, texto)
  }
})

test('CAMPO SIN entrega: el gasto y el pago van derecho a la caja, y tampoco se escriben', async () => {
  for (const texto of ['pagué 50.000 de gasoil', 'le pagué 30000 a Rodrigo Sosa']) {
    const s = espias(); const a = actor()
    const r = await conPuerto(pagos, texto, { port: portFalso({ rol: 'campo', vista: [] }), a, ev: `ev-s${n}`, s })
    assert.equal(r.estado, 'rechazado_no_rinde', texto); assert.equal(s.total(), 0, texto)
  }
})

test('CAMPO sin entrega que pide un adelanto (adelantos-sueldo → caja): no escribe en Liquidación', async () => {
  const s = espias(); const a = actor()
  const r = await conPuerto(adelantos, 'le di 8500 de adelanto a Rodrigo', { port: portFalso({ rol: 'campo', vista: [] }), a, ev: 'ev-s9', s })
  assert.equal(r.estado, 'rechazado_no_rinde'); assert.equal(s.total(), 0)
  assert.match(r.texto, /Administración/)
})

test('sin rol legible, «de la caja»: fail-closed', async () => {
  const s = espias(); const a = actor()
  const r = await enPagos('le pagué 30000 a Rodrigo Sosa de la caja', { rol: null, a, ev: 'ev-x2', s })
  assert.equal(r.estado, 'rechazado_no_rinde'); assert.equal(s.total(), 0)
})

test('la puerta sigue abierta para quien corresponde: jefe y Dirección cargan el pago «de la caja»', async () => {
  for (const rol of ['jefe_obra', 'direccion', 'administracion']) {
    const s = espias(); const a = actor()
    const r = await enPagos('le pagué 30000 a Rodrigo Sosa de la caja', { rol, a, ev: `ev-j${n}`, s })
    assert.equal(r.estado, 'pago_cargado', rol); assert.equal(s.pagosCaja.length, 1, rol); assert.equal(s.total(), 1, rol)
  }
})

test('si igual llega el 42501 de la base, se dice y no se da por cargado', async () => {
  const s = espias(); const a = actor()
  s.registrar = async () => { throw Object.assign(new Error('un pago en efectivo a cuenta lo carga un jefe de obra o Administración'), { code: '42501' }) }
  const r = await enPagos('le pagué 30000 a Rodrigo Sosa de la caja', { rol: 'jefe_obra', a, ev: 'ev-b1', s })
  assert.equal(r.estado, 'rechazado_sin_permiso'); assert.match(r.texto, /No cargué nada/)
})
