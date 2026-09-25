// Adelantos de sueldo escritos en el canal Efectivo (dueño, 25/09/2026).
//
// Sin base y sin modelo: el puerto es un doble que contesta por el texto de la consulta, y la escritura se
// inyecta para ver EXACTAMENTE qué se le manda. Lo que se prueba es lo que cuesta plata: que las puertas fallen
// cerrado, que ante la duda no se escriba, que la respuesta en el hilo complete lo que faltaba, y que la cuenta
// de la celda se SUME a la que había.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cuentaNueva, especialista, finDeQuincena, textoCargado, TEXTO } from './adelantos-sueldo.mjs'
import { especialista as entregas } from './entregas-efectivo.mjs'
import { especialista as libreta } from './libreta.mjs'
import { resolver } from '../director.mjs'

const actor = (root = 'post-1') => ({ plataforma_user_id: 'mm-jefe', channel_id: 'ch-efectivo', root_post_id: root })
const PERSONAS = [
  { id: 'gemiliano', nombre_completo: 'GONZALEZ TOBARES EMILIANO', nombre_para_mostrar: 'Emiliano Gonzalez', apodos: [] },
  { id: 'maldonado', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado', apodos: ['Emi Maldonado'] },
  { id: 'nievas', nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO', nombre_para_mostrar: 'Juan Pablo Nievas', apodos: [] },
  { id: 'pastran', nombre_completo: 'PASTRAN MARCELO IVAN', nombre_para_mostrar: 'Marcelo Pastran', apodos: [] },
  { id: 'tello', nombre_completo: 'TELLO JUAN ALBERTO', nombre_para_mostrar: 'Juan Tello', apodos: [] },
]
const ENTREGA = { id: 'e21', codigo: 'ER-0021', estructura: true, es_prueba: false, obra: null }

function portFalso({ canal = true, persona = 'nievas', perfil = 'perf-jefe', abiertas = [ENTREGA], esPrueba = false } = {}) {
  return {
    async query(sql) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ canal_nombre: 'Efectivo' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: perfil ? [{ perfil_id: perfil, persona_id: persona, es_prueba: esPrueba }] : [] }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: abiertas }
      if (/from public\.personas p/.test(sql)) return { rows: PERSONAS }
      if (/from public\.proveedores/.test(sql)) return { rows: [{ nombre: 'Pedro Tello', razon_social: null }] }
      return { rows: [] }
    },
  }
}

const atender = (texto, o = {}) => {
  const escrituras = []
  const port = o.port ?? portFalso(o)
  return especialista.atender({
    texto, port, actor: o.actor ?? actor(), commEventId: o.commEventId ?? 'ev-1', ahora: new Date('2026-09-25T15:00:00Z'),
    intencion: o.intencion, registrar: async (p) => { escrituras.push(p); return o.resultado ?? { estado: 'cargado', codigo: 'ER-0021', desde: '2026-09-16', hasta: '2026-09-30', grupo: 'obreros', pagada: false } },
  }).then((r) => ({ r, escrituras }))
}

test('reclama el adelanto escrito, y no una foto, ni otro canal, ni una entrega', async () => {
  assert.equal((await especialista.reconoce('le di 8500 de adelanto a Pastrán', { area: 'rendicion' }))?.destino, 'adelanto')
  assert.equal(await especialista.reconoce('le di 8500 de adelanto a Pastrán', { area: 'compras' }), null)
  assert.equal(await especialista.reconoce('le di 8500 de adelanto a Pastrán', { area: 'rendicion', fileIds: ['f'] }), null)
  assert.equal(await especialista.reconoce('le di 20 mil a Pastrán', { area: 'rendicion' }), null, 'sin «adelanto» es una entrega')
  // «a cuenta» sólo con alguien del plantel
  assert.equal((await especialista.reconoce('pagué 7600 a Nievas a cuenta', { area: 'rendicion', port: portFalso() }))?.destino, 'adelanto')
  assert.equal(await especialista.reconoce('a cuenta 50.000 flete', { area: 'rendicion', port: portFalso() }), null)
})

test('entregas y libreta se hacen a un lado ante un adelanto (antes se registraba una ENTREGA al empleado)', async () => {
  assert.equal(await entregas.reconoce('le di 8500 de adelanto a Pastrán', { area: 'rendicion' }), null)
  assert.equal(await entregas.reconoce('adelanto 20 mil a Emiliano', { area: 'rendicion' }), null)
  assert.equal(await libreta.reconoce('adelanto 20 mil a Emiliano', { area: 'rendicion' }), null)
  assert.equal(await libreta.reconoce('pagué 7600 a Nievas a cuenta', { area: 'rendicion', port: portFalso() }), null)
  // Lo de siempre sigue igual.
  assert.equal((await entregas.reconoce('le di 20 mil a Pastrán', { area: 'rendicion' }))?.destino, 'entregar')
  assert.equal((await libreta.reconoce('Flete 19/9 60.000', { area: 'rendicion', port: portFalso() }))?.destino, 'libreta')
})

test('el Director manda el adelanto a este especialista en el canal Efectivo', async () => {
  const port = {
    async query(sql, params) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] }
      return portFalso().query(sql, params)
    },
  }
  for (const texto of ['le di 8500 de adelanto a Pastrán', 'adelanto 20 mil a Emiliano', 'pagué 7600 a Nievas a cuenta']) {
    const r = await resolver({ texto, port, channelId: 'ch-efectivo', actor: actor() })
    assert.equal(r.especialista?.slug, 'adelantos-sueldo', texto)
  }
  const e = await resolver({ texto: 'le di 20 mil a Pastrán', port, channelId: 'ch-efectivo', actor: actor() })
  assert.equal(e.especialista?.slug, 'entregas-efectivo')
})

test('carga lo que dice el mensaje contra la entrega de QUIEN ESCRIBE, con la clave del mensaje', async () => {
  const { r, escrituras } = await atender('le di 8500 de adelanto a Pastrán')
  assert.equal(escrituras.length, 1)
  const p = escrituras[0]
  assert.equal(p.entrega.codigo, 'ER-0021')
  assert.equal(p.persona.id, 'pastran')
  assert.equal(p.importe, 8500)
  assert.equal(p.expresion, '8500')
  assert.equal(p.fecha, '2026-09-25')
  assert.equal(p.clave, 'adelanto:ev-1')
  assert.equal(p.post, 'post-1')
  assert.equal(p.perfilId, 'perf-jefe')
  assert.equal(r.estado, 'adelanto_cargado')
  assert.match(r.texto, /Adelanto de \*\*\$ 8\.500\*\* a \*\*Marcelo Pastran\*\* cargado en Liquidación, quincena 16\/09–30\/09/)
  assert.match(r.texto, /Rendido de tu entrega \*\*ER-0021\*\*/)
  assert.match(r.texto, /administracion\/personas\?vista=liquidacion&quincena=2026-09-16/)
  assert.doesNotMatch(r.texto, /te quedan|saldo de \$|suma \$/i, 'ni el saldo ni lo que suma el empleado se publican en el canal')
})

test('las puertas fallen cerrado y NO escriben', async () => {
  for (const [o, estado] of [
    [{ canal: false }, 'rechazado_canal'],
    [{ perfil: null }, 'rechazado_sin_persona'],
    [{ esPrueba: true }, 'rechazado_persona_prueba'],
    [{ abiertas: [] }, 'rechazado_sin_entrega'],
    [{ abiertas: [{ ...ENTREGA, es_prueba: true }] }, 'rechazado_entrega_prueba'],
  ]) {
    const { r, escrituras } = await atender('le di 8500 de adelanto a Pastrán', { ...o, actor: actor(`p-${estado}`) })
    assert.equal(r.estado, estado)
    assert.equal(escrituras.length, 0, `${estado}: no puede escribir`)
  }
})

test('ante la duda pregunta en el hilo, y la respuesta en ESE hilo completa la carga', async () => {
  const a = actor('hilo-emi')
  const port = portFalso()
  const q = await atender('adelanto 20 mil a Emiliano', { actor: a, port, commEventId: 'ev-emi' })
  assert.equal(q.r.estado, 'pregunta_persona_ambigua')
  assert.equal(q.escrituras.length, 0)
  assert.match(q.r.texto, /1 · Emiliano/)

  // La respuesta en otro hilo no la toma nadie de acá.
  assert.equal(await especialista.reconoce('2', { area: 'rendicion', actor: actor('otro-hilo') }), null)
  const ruta = await especialista.reconoce('2', { area: 'rendicion', actor: a })
  assert.equal(ruta?.destino, 'respuesta')
  const idx = q.r.texto.includes('1 · Emiliano Maldonado') ? '1' : '2'
  const r = await atender(idx, { actor: a, port, intencion: ruta, commEventId: 'ev-respuesta' })
  assert.equal(r.r.estado, 'adelanto_cargado')
  assert.equal(r.escrituras[0].persona.id, 'maldonado')
  assert.equal(r.escrituras[0].importe, 20000)
  assert.equal(r.escrituras[0].clave, 'adelanto:ev-emi', 'la clave es la del mensaje del adelanto, no la de la respuesta')
  assert.equal(await especialista.reconoce('2', { area: 'rendicion', actor: a }), null, 'contestada, no queda abierta')
})

test('«no» en el hilo cancela sin escribir; lo que no se entiende se repregunta', async () => {
  const a = actor('hilo-no')
  const port = portFalso()
  await atender('adelanto 20 mil a Emiliano', { actor: a, port })
  const ruta = { destino: 'respuesta', confianza: 0.95 }
  const x = await atender('cualquier cosa', { actor: a, port, intencion: ruta })
  assert.equal(x.r.estado, 'pregunta_repetida')
  const n = await atender('no', { actor: a, port, intencion: ruta })
  assert.equal(n.r.texto, TEXTO.CANCELADO)
  assert.equal(n.escrituras.length, 0)
})

test('con dos entregas abiertas pregunta cuál, y el código en el hilo la elige', async () => {
  const a = actor('hilo-dos')
  const abiertas = [ENTREGA, { id: 'e20', codigo: 'ER-0020', estructura: false, obra: 'Galpón 8', es_prueba: false }]
  const port = portFalso({ abiertas })
  const q = await atender('adelanto 7600 a Nievas', { actor: a, port })
  assert.equal(q.r.estado, 'pregunta_entrega')
  assert.match(q.r.texto, /ER-0020/)
  const r = await atender('ER-0020', { actor: a, port, intencion: { destino: 'respuesta', confianza: 0.95 } })
  assert.equal(r.r.estado, 'adelanto_cargado')
  assert.equal(r.escrituras[0].entrega.codigo, 'ER-0020')
})

test('la quincena cerrada no recibe el adelanto: se dice qué pasó y que no se rindió', async () => {
  const { r } = await atender('adelanto 20 mil a Pastrán', { resultado: { estado: 'cerrada', desde: '2026-09-01', hasta: '2026-09-15', grupo: 'obreros' }, actor: actor('p-cerrada') })
  assert.equal(r.estado, 'rechazado_quincena_cerrada')
  assert.match(r.texto, /01\/09–15\/09/)
  assert.match(r.texto, /cerrada/)
  assert.match(r.texto, /Tampoco lo rendí de \*\*ER-0021\*\*/)
})

test('un error de la base se dice, y dice que no se tocó nada', async () => {
  const port = portFalso()
  const r = await especialista.atender({
    texto: 'adelanto 900 mil a Pastrán', port, actor: actor('p-err'), commEventId: 'ev-x', ahora: new Date('2026-09-25T15:00:00Z'),
    registrar: async () => { throw new Error('ERROR: el adelanto es más de lo que queda a rendir en ER-0021') },
  })
  assert.equal(r.estado, 'error')
  assert.match(r.texto, /más de lo que te queda a rendir/)
  assert.match(r.texto, /No se rindió nada de tu entrega ni se tocó Liquidación/)
})

test('la cuenta de la celda SE SUMA a la que había, con el mismo lector de la app', () => {
  // El ejemplo del dueño: «8500*8 + 7600» y ahora 20000.
  assert.deepEqual(cuentaNueva({ antes: 75600, formula: '=8500*8+7600' }, '20000'), { formula: '=8500*8+7600+20000', valor: 95600 })
  // Número escrito sin cuenta.
  assert.deepEqual(cuentaNueva({ antes: 178000, formula: null }, '20000'), { formula: '=178000+20000', valor: 198000 })
  // Calculada (del espejo de JORNALES) con plata: se escribe desde el número que mostraba.
  assert.deepEqual(cuentaNueva({ antes: 140000, formula: null }, '8500*8'), { formula: '=140000+8500*8', valor: 208000 })
  // Vacía.
  assert.deepEqual(cuentaNueva({ antes: 0, formula: null }, '20000'), { formula: '=20000', valor: 20000 })
  // Una cuenta vieja que no da lo que la celda muestra no se arrastra.
  assert.deepEqual(cuentaNueva({ antes: 70000, formula: '=8500*8' }, '7600'), { formula: '=70000+7600', valor: 77600 })
  // Decimales a la argentina.
  assert.deepEqual(cuentaNueva({ antes: 113200.5, formula: null }, '100'), { formula: '=113200,5+100', valor: 113300.5 })
})

test('la confirmación, entera', () => {
  const t = textoCargado({ importe: 20000, persona: 'Emiliano Gonzalez', desde: '2026-09-16', hasta: '2026-09-30', codigo: 'ER-0021', pagada: true })
  assert.match(t, /quincena 16\/09–30\/09/)
  assert.match(t, /ya estaba marcada \*\*pagada\*\*/)
  assert.equal(finDeQuincena('2026-09-16'), '2026-09-30')
  assert.equal(finDeQuincena('2026-02-16'), '2026-02-28')
  assert.equal(finDeQuincena('2026-09-01'), '2026-09-15')
})
