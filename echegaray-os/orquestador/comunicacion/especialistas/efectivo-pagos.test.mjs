// Pagos en efectivo escritos en el canal Efectivo (dueño, 30/09/2026): los tres mensajes que fallaron, más los
// que ya andaban. Sin base y sin modelo: puerto doble, escrituras inyectadas para ver EXACTAMENTE qué se manda.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista, registrarPagoDirecto, TEXTO } from './efectivo-pagos.mjs'
import { especialista as adelantos } from './adelantos-sueldo.mjs'
import { especialista as libreta } from './libreta.mjs'
import { resolver } from '../director.mjs'

const actor = (root = 'post-1') => ({ plataforma_user_id: 'mm-jefe', channel_id: 'ch-efectivo', root_post_id: root, plataforma: 'mattermost' })
const PERSONAS = [
  { id: 'rodrigo', nombre_completo: 'SOSA RODRIGO', nombre_para_mostrar: 'Rodrigo Sosa', apodos: [] },
  { id: 'maldonado', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado', apodos: ['Emi Maldonado'] },
  { id: 'gemiliano', nombre_completo: 'GONZALEZ TOBARES EMILIANO', nombre_para_mostrar: 'Emiliano Gonzalez', apodos: [] },
  { id: 'jorge', nombre_completo: 'CORONA JORGE', nombre_para_mostrar: 'Jorge Corona', apodos: [] },
]
const ENTREGA = { id: 'e21', codigo: 'ER-0021', estructura: true, es_prueba: false, obra: null }
const SUB = { id: 's1', obra_id: 'o-quatt', obra_nombre: 'Quattropani', proveedor_id: 'p-nasser', proveedor_texto: 'Nasser Hermanos', nombre: 'Albañilería', alcance: null, precio_contratado: 9000000 }

function portFalso({ canal = true, perfil = 'perf-jefe', abiertas = [], subs = [SUB] } = {}) {
  return {
    async query(sql) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: perfil ? [{ perfil_id: perfil, persona_id: 'p-jefe', es_prueba: false, nombre: 'Jefe', rol: 'jefe_obra' }] : [] }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: abiertas }
      if (/from public\.personas p/.test(sql)) return { rows: PERSONAS }
      if (/from public\.subcontrato s/.test(sql) && /join public\.obra_canonica/.test(sql)) return { rows: subs }
      if (/from public\.proveedores/.test(sql)) return { rows: [{ id: 'p-nasser', nombre: 'Nasser Hermanos', razon_social: null, subcontratista: true }, { id: 'p-hormi', nombre: 'Hormiserv SA', razon_social: null, subcontratista: false }] }
      if (/from public\.obra_canonica o left join/.test(sql)) return { rows: [{ id: 'o-quatt', nombre: 'Quattropani', alias: [] }, { id: 'o-mess', nombre: 'Messina', alias: [] }] }
      if (/from public\.activo/.test(sql)) return { rows: [{ id: 'r1', codigo: 'RO-003', nombre: 'Ford F100', patente: null }] }
      return { rows: [] }
    },
  }
}

const ahora = new Date('2026-09-30T15:00:00Z')
function atender(texto, o = {}) {
  const directos = []
  const fajos = []
  const port = o.port ?? portFalso(o)
  return especialista.atender({
    texto, port, actor: o.actor ?? actor(), commEventId: o.commEventId ?? 'ev-1', ahora,
    registrar: async (p) => { directos.push(p); return { estado: 'cargado', desde: '2026-09-16', hasta: '2026-09-30', grupo: 'obreros', pagada: false } },
    abrir: async (_p, f) => { fajos.push(f); return f },
    escribir: async () => ({ texto: 'Cargado en Compras.', estado: 'cargado' }),
  }).then((r) => ({ r, directos, fajos }))
}

test('el Director manda cada uno de los tres mensajes al especialista correcto', async () => {
  const port = portFalso()
  for (const [texto, slug] of [
    ['hoy le pague 100 a rodrigo', 'efectivo-pagos'],
    ['hoy le pague 150000 de adelanto a emiliano maldonado', 'adelantos-sueldo'],
    ['se pagaron 220000 en efectivo de arreglo de fordf100', 'efectivo-pagos'],
    ['le pagué 500000 a Nasser por Quattropani', 'efectivo-pagos'],
    ['150 a Jorge', 'entregas-efectivo'],
    ['20000 a emiliano maldonado', 'entregas-efectivo'],
    ['Flete 19/9 60.000', 'libreta'],
  ]) {
    const r = await resolver({ texto, port, channelId: 'ch-efectivo', actor: actor() })
    assert.equal(r.especialista?.slug, slug, texto)
  }
})

test('la libreta se hace a un lado ante un pago escrito como frase', async () => {
  assert.equal(await libreta.reconoce('hoy le pague 100 a rodrigo', { area: 'rendicion', port: portFalso() }), null)
  assert.equal((await libreta.reconoce('Flete 19/9 60.000', { area: 'rendicion', port: portFalso() }))?.destino, 'libreta')
})

test('«le pagué 100 a Rodrigo»: pago a cuenta por la misma celda, en el hilo, con clave de mensaje', async () => {
  const { r, directos } = await atender('hoy le pague 100 a rodrigo')
  assert.equal(directos.length, 1)
  assert.equal(directos[0].persona.id, 'rodrigo'); assert.equal(directos[0].importe, 100)
  assert.equal(directos[0].fecha, '2026-09-30'); assert.equal(directos[0].clave, 'pago-efectivo:ev-1')
  assert.equal(r.estado, 'pago_cargado')
  assert.match(r.texto, /\*\*\$ 100\*\* a \*\*Rodrigo Sosa\*\*.*quincena 16\/09–30\/09.*efectivo, a cuenta/)
})

test('«150000 de adelanto a emiliano maldonado» sin entrega: lo atiende adelantos delegando, sin rendir nada', async () => {
  const directos = []
  const r = await adelantos.atender({
    texto: 'hoy le pague 150000 de adelanto a emiliano maldonado', port: portFalso(), actor: actor('p2'), commEventId: 'ev-2', ahora,
    registrarDirecto: async (p) => { directos.push(p); return { estado: 'cargado', desde: '2026-09-16', hasta: '2026-09-30', grupo: 'obreros' } },
  })
  assert.equal(directos.length, 1); assert.equal(directos[0].persona.id, 'maldonado'); assert.equal(directos[0].importe, 150000)
  assert.equal(r.estado, 'pago_cargado')
  assert.match(r.texto, /efectivo, a cuenta/)
})

test('un mensual (oficina) se dice contra el mes', async () => {
  const port = portFalso()
  const r = await especialista.atender({
    texto: 'pagué 5000 a rodrigo a cuenta', port, actor: actor('p3'), commEventId: 'ev-3', ahora,
    registrar: async () => ({ estado: 'cargado', desde: '2026-09-16', hasta: '2026-09-30', grupo: 'oficina' }),
  })
  assert.match(r.texto, /el mes de septiembre/)
})

test('gasto sin ticket: fila de Compras en Efectivo, rodado, tipo de costo, nunca A rendir', async () => {
  const { r, fajos, directos } = await atender('se pagaron 220000 en efectivo de arreglo de fordf100')
  assert.equal(directos.length, 0); assert.equal(fajos.length, 1)
  const c = fajos[0].items[0].comprobante
  assert.equal(c.total, 220000); assert.equal(c.formaPago, 'Efectivo'); assert.equal(c.condicion, 'Contado'); assert.equal(c.pagado, 220000)
  assert.match(c.concepto, /arreglo de fordf100/); assert.match(c.concepto, /RO-003/); assert.match(c.concepto, /Indirecto/)
  assert.doesNotMatch(JSON.stringify(fajos[0]), /rendir/i)
  assert.equal(fajos[0].items[0].origenCarga, 'libreta')
  assert.match(r.texto, /Cargado en Compras/); assert.match(r.texto, /sin completar el proveedor y la obra|sin completar/)
})

test('gasto con entrega abierta y sin decir de dónde: pregunta en una línea, y la respuesta «caja» lo carga', async () => {
  const a = actor('p4')
  const port = portFalso({ abiertas: [ENTREGA] })
  const q = await atender('pagué 50000 de gasoil', { port, actor: a })
  assert.equal(q.r.estado, 'pregunta_origen'); assert.equal(q.fajos.length, 0)
  assert.match(q.r.texto, /ER-0021.*caja/)
  assert.equal((await especialista.reconoce('caja', { area: 'rendicion', actor: a }))?.destino, 'respuesta')
  const c = await atender('caja', { port, actor: a })
  assert.equal(c.fajos.length, 1); assert.equal(c.fajos[0].items[0].comprobante.total, 50000)
  // Si ya lo dice, no pregunta.
  const d = await atender('pagué 50000 de gasoil de la caja', { port, actor: actor('p5') })
  assert.equal(d.fajos.length, 1)
})

test('subcontratista: proveedor del padrón, obra deducida, tipo de pago y saldo del contrato', async () => {
  const { r, fajos } = await atender('le pagué 500000 a Nasser por Quattropani')
  const c = fajos[0].items[0].comprobante
  assert.equal(c.proveedor, 'Nasser Hermanos'); assert.equal(c.obra, 'Quattropani'); assert.equal(c.formaPago, 'Efectivo')
  assert.match(c.concepto, /Directo \(subcontrato\)/)
  assert.match(r.texto, /Subcontrato: Albañilería · contratado \$ 9\.000\.000/)
  const t = await atender('transferí 300000 a Nasser', { actor: actor('p6') })
  assert.equal(t.fajos[0].items[0].comprobante.formaPago, 'Transferencia')
})

test('subcontratista con varios subcontratos pregunta listando, y la respuesta carga', async () => {
  const dos = [SUB, { ...SUB, id: 's2', obra_id: 'o-mess', obra_nombre: 'Messina', nombre: 'Revoques' }]
  const a = actor('p7')
  const port = portFalso({ subs: dos })
  const q = await atender('pagué 1.200.000 a Nasser en efectivo', { port, actor: a })
  assert.equal(q.r.estado, 'pregunta_subcontrato_varios'); assert.equal(q.fajos.length, 0)
  assert.match(q.r.texto, /1 · Quattropani.*\n2 · Messina/)
  const c = await atender('2', { port, actor: a })
  assert.equal(c.fajos[0].items[0].comprobante.obra, 'Messina')
})

test('subcontratista sin subcontrato: carga y pide la obra', async () => {
  const { r, fajos } = await atender('le pagué 500000 a Nasser', { subs: [] })
  assert.equal(fajos.length, 1); assert.match(r.texto, /la obra/)
})

test('el bot no calla: sin importe dice qué entendió; persona ambigua lista; desconocida lo dice; transferencia a persona se explica', async () => {
  let x = await atender('le pagué a rodrigo', { actor: actor('q1') })
  assert.equal(x.r.estado, 'pregunta_monto'); assert.match(x.r.texto, /importe/)
  x = await atender('le pagué 5000 a emiliano', { actor: actor('q2') })
  assert.equal(x.r.estado, 'pregunta_persona_ambigua'); assert.match(x.r.texto, /1 · /)
  const a = actor('q3')
  assert.equal((await atender('le pagué 5000 a emiliano', { actor: a })).r.estado, 'pregunta_persona_ambigua')
  const ok = await atender('1', { actor: a })
  assert.equal(ok.directos.length, 1)
  x = await atender('le transferí 100 a rodrigo', { actor: actor('q4') })
  assert.equal(x.r.texto, TEXTO.TRANSFERENCIA_A_PERSONA); assert.equal(x.directos.length, 0)
  for (const r of [x.r]) assert.doesNotMatch(r.texto, /ninguno tenía lo mínimo/)
})

test('las puertas fallan cerrado y no escriben', async () => {
  for (const [o, estado] of [[{ canal: false }, 'rechazado_canal'], [{ perfil: null }, 'rechazado_sin_persona']]) {
    const { r, directos, fajos } = await atender('hoy le pague 100 a rodrigo', { ...o, actor: actor(`z-${estado}`) })
    assert.equal(r.estado, estado); assert.equal(directos.length + fajos.length, 0)
  }
})

test('registrarPagoDirecto: suma a la celda, verifica en destino y sin migración no escribe', async () => {
  const calls = []
  const celda = { estado: 'abierta', desde: '2026-09-16', hasta: '2026-09-30', grupo: 'obreros', antes: 0, formula: null }
  const mk = (rpc) => ({
    async query(sql, p) {
      calls.push(sql)
      if (/adelanto_de_sueldo_celda/.test(sql)) return { rows: [{ c: celda }] }
      if (/pago_efectivo_de_sueldo/.test(sql)) return rpc(p)
      return { rows: [{ pagado_efectivo: 100, formula: '=100', registros: 1 }] }
    },
  })
  const ok = await registrarPagoDirecto({ port: mk((p) => ({ rows: [{ r: { ya_estaba: false, desde: '2026-09-16', hasta: '2026-09-30', grupo: 'obreros' } }] })), persona: { id: 'rodrigo' }, fecha: '2026-09-30', importe: 100, expresion: '100', clave: 'pago-efectivo:x', post: 'p', perfilId: 'u' })
  assert.equal(ok.estado, 'cargado'); assert.equal(ok.formula, '=100')
  const sin = await registrarPagoDirecto({ port: mk(() => { const e = new Error('no existe'); e.code = '42883'; throw e }), persona: { id: 'rodrigo' }, fecha: '2026-09-30', importe: 100, expresion: '100', clave: 'pago-efectivo:x', post: 'p', perfilId: 'u' })
  assert.equal(sin.estado, 'sin_migracion')
  await assert.rejects(registrarPagoDirecto({ port: { async query(sql) { if (/celda/.test(sql)) return { rows: [{ c: celda }] }; if (/pago_efectivo_de_sueldo/.test(sql)) return { rows: [{ r: { ya_estaba: false, desde: '2026-09-16', grupo: 'obreros' } }] }; return { rows: [{ pagado_efectivo: 5, formula: '=5', registros: 1 }] } } }, persona: { id: 'r' }, fecha: '2026-09-30', importe: 100, expresion: '100', clave: 'pago-efectivo:y', post: 'p', perfilId: 'u' }), /la base no muestra lo escrito/)
})
