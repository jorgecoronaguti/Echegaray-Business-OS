// #comprobantes-gastos con número de entrega (24/09/2026): sin número el canal no cambia; con número va a
// ESA entrega como «A rendir», y sólo si quien manda puede.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista } from '../especialistas/comprobantes.mjs'
import { codigosDeEntrega, decidirImputacion, cierreDeImputacion, codigoDe } from './imputacion-a-entrega.mjs'
import { parteVacia, textoTanda, sumarPartes } from '../../lib/comprobantes/parte.mjs'

// ── El mensaje REAL de las 17:04 del 24/09 (inbox 73c7da7e): el dueño, 9 fotos, sin una palabra ──
const REAL_1704 = Object.freeze({
  texto: '',
  postId: 'fm9y5doj1jnjtjyq69ocqsx5dc',
  fileIds: ['61x7tjtctprni8x4b47uuxrjjw', 'apjmffm7e78zxk4q1gg5qrq65e', 'bwbna9s7miya9qydwxkbrs9oby',
    'cdd9qdd3jt8ezeump84nbej9ec', 'fdzfr8543frxjm4x66gbinj56h', 'foc1suz3efyaik6zcu43h1bh4h',
    'odky753buinsmdmu4iiw7whtbw', 'orr9smgb738t5c7ozmxd47ih3c', 'phhn83rbibn6z8zyqtigsdircr'],
  actor: { plataforma: 'mattermost', plataforma_user_id: 'sascwozf13gppfubp6zkq3s8ho', channel_id: 'ataehrdpmfyctqyjcfz5rs9jka', root_post_id: 'fm9y5doj1jnjtjyq69ocqsx5dc' },
})

const ENTREGA = { id: 'e20', codigo: 'ER-0020', persona_id: 'pEmi', estructura: false, es_prueba: false, anulada: false, cerrada: false, obra: 'Galpón 9', obra_codigo: 'OB-0031', persona: 'Emiliano Maldonado', persona_prueba: false, mm_usuario: 'emiliano' }
const DUENO = { perfil_id: 'uJorge', rol: 'direccion', persona_id: 'pJorge' }
const EMI = { perfil_id: 'uEmi', rol: 'jefe_obra', persona_id: 'pEmi' }
const OTRO = { perfil_id: 'uOtro', rol: 'jefe_obra', persona_id: 'pOtro' }

function portFalso({ remitente = DUENO, entrega = ENTREGA, vinculadas = 1 } = {}) {
  const q = []
  return {
    q,
    async query(sql, args) {
      q.push({ sql, args })
      if (/comunicacion\.identidades i\s+join auth\.users/.test(sql)) return { rows: remitente ? [remitente] : [] }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: entrega ? [entrega] : [] }
      if (/count\(\*\)::int as n from public\.efectivo_rendicion/.test(sql)) return { rows: [{ n: vinculadas }] }
      return { rows: [] }
    },
  }
}

/** La tanda real publica en Mattermost: acá se reemplaza por una que sólo corre el trabajo. */
function tandaEspia() {
  const llamadas = []
  const f = async (dep, m, trabajo) => { llamadas.push(m); return await trabajo() }
  f.llamadas = llamadas
  return f
}
function procesarEspia(r = { texto: '✔ cargué 9', estado: 'cargado', fajoId: 'f1', parte: { ...parteVacia(), recibidos: 9, cargados: 9 } }) {
  const llamadas = []
  const f = async (dep, mensaje) => { llamadas.push({ dep, mensaje }); return r }
  f.llamadas = llamadas
  return f
}

test('REGRESIÓN · el post real de las 17:04 (9 fotos, sin texto) se carga EXACTAMENTE como antes', async () => {
  const port = portFalso()
  const procesar = procesarEspia()
  const tanda = tandaEspia()
  const r = await especialista.atender({ ...REAL_1704, port, procesar, tanda, intencion: { destino: 'cargar' } })

  assert.equal(port.q.length, 0, 'sin número no se consulta la base: ni remitente, ni entrega, ni ticket')
  assert.equal(procesar.llamadas.length, 1)
  const { mensaje } = procesar.llamadas[0]
  assert.deepEqual(Object.keys(mensaje).sort(), ['actor', 'ahora', 'channelId', 'fileIds', 'postId', 'rootPostId', 'texto'])
  assert.equal(mensaje.forzar, undefined, 'no fuerza ninguna forma de pago: la del papel')
  assert.equal(mensaje.texto, '')
  assert.deepEqual(mensaje.fileIds, REAL_1704.fileIds)
  assert.equal(mensaje.postId, REAL_1704.postId)
  assert.equal(mensaje.rootPostId, REAL_1704.postId)
  assert.equal(mensaje.channelId, 'ataehrdpmfyctqyjcfz5rs9jka')
  assert.deepEqual(tanda.llamadas[0], {
    plataforma: 'mattermost', userId: 'sascwozf13gppfubp6zkq3s8ho', channelId: 'ataehrdpmfyctqyjcfz5rs9jka',
    postId: REAL_1704.postId, rootPostId: REAL_1704.postId, recibidos: 9,
  })
  // Lo que devuelve es lo del circuito, sin agregados.
  assert.deepEqual(r, { texto: '✔ cargué 9', estado: 'cargado', fajoId: 'f1', parte: { ...parteVacia(), recibidos: 9, cargados: 9 }, privado: false })
})

test('REGRESIÓN · el texto de obra de siempre («GALPON 9», «OC 1234», un CUIT) no se lee como número de entrega', async () => {
  for (const texto of ['GALPON 9', 'MESSINA oc 1234', '20-12345678-9', 'factura 0004-00036542', 'SUPER20 ferretería', 'hierro 8mm x 12', 'PERÉZ GARCÍA']) {
    assert.deepEqual(codigosDeEntrega(texto), [], texto)
    const port = portFalso()
    const procesar = procesarEspia()
    await especialista.atender({ ...REAL_1704, texto, port, procesar, tanda: tandaEspia(), intencion: { destino: 'cargar' } })
    assert.equal(port.q.length, 0, texto)
    assert.equal(procesar.llamadas[0].mensaje.texto, texto, 'la obra sale del texto, como siempre')
    assert.equal(procesar.llamadas[0].mensaje.forzar, undefined)
  }
})

test('el mensaje de la tanda sin imputaciones es idéntico al de siempre', () => {
  const p = { ...parteVacia(), recibidos: 9, cargados: 9, suma: 120000 }
  const viejo = { ...p }
  delete viejo.imputaciones
  assert.equal(textoTanda(p), textoTanda(viejo))
  assert.equal(textoTanda(sumarPartes(viejo, viejo)), textoTanda(sumarPartes(p, p)))
})

test('los números de entrega: ER-0020, er 20, ER20, ER-20; varios se detectan', () => {
  for (const t of ['ER-0020', 'er 20', 'ER20', 'ER-20', 'flete galpón er-0020 gracias']) assert.deepEqual(codigosDeEntrega(t), [20], t)
  assert.deepEqual(codigosDeEntrega('ER-20 y ER-21'), [20, 21])
  assert.deepEqual(codigosDeEntrega('ER-20 ER 0020'), [20], 'el mismo número dos veces es uno')
  assert.equal(codigoDe(20), 'ER-0020')
})

test('permisos: Dirección y Administración a cualquiera; los demás sólo a lo suyo', () => {
  const e = { ...ENTREGA }
  const rem = (x) => ({ perfilId: x.perfil_id, rol: x.rol, personaId: x.persona_id })
  assert.equal(decidirImputacion({ numeros: [20], remitente: rem(DUENO), entrega: e }).ok, true)
  assert.equal(decidirImputacion({ numeros: [20], remitente: { ...rem(OTRO), rol: 'administracion' }, entrega: e }).ok, true)
  assert.equal(decidirImputacion({ numeros: [20], remitente: rem(EMI), entrega: e }).ok, true, 'la suya')
  const r = decidirImputacion({ numeros: [20], remitente: rem(OTRO), entrega: e })
  assert.equal(r.motivo, 'sin_permiso')
  assert.match(r.texto, /ER-0020.*no es tuya.*No cargué nada/s)
})

test('número inexistente, anulado, cerrado, de prueba o doble: se dice y no se carga', () => {
  const rem = { perfilId: 'u', rol: 'direccion', personaId: 'p' }
  const casos = [
    [{ numeros: [99], remitente: rem, entrega: null }, 'no_existe', /ER-0099/],
    [{ numeros: [20], remitente: rem, entrega: { ...ENTREGA, anulada: true } }, 'anulada', /anulada/],
    [{ numeros: [20], remitente: rem, entrega: { ...ENTREGA, cerrada: true } }, 'cerrada', /cerrada/],
    [{ numeros: [20], remitente: rem, entrega: { ...ENTREGA, es_prueba: true } }, 'prueba', /prueba/],
    [{ numeros: [20, 21], remitente: rem, entrega: null }, 'varios_codigos', /ER-0020, ER-0021/],
    [{ numeros: [20], remitente: null, entrega: ENTREGA }, 'sin_usuario', /usuario/],
  ]
  for (const [p, motivo, re] of casos) {
    const r = decidirImputacion(p)
    assert.equal(r.motivo, motivo)
    assert.match(r.texto, re)
    assert.match(r.texto, /No cargué nada/i)
  }
})

test('rechazado: no se registra el ticket ni se baja una foto', async () => {
  for (const [port, estado] of [
    [portFalso({ entrega: null }), 'rechazado_no_existe'],
    [portFalso({ entrega: { ...ENTREGA, anulada: true } }), 'rechazado_anulada'],
    [portFalso({ remitente: OTRO }), 'rechazado_sin_permiso'],
    [portFalso({ remitente: null }), 'rechazado_sin_usuario'],
  ]) {
    const procesar = procesarEspia()
    const r = await especialista.atender({ ...REAL_1704, texto: 'ER-0020', port, procesar, tanda: tandaEspia(), intencion: { destino: 'cargar' } })
    assert.equal(r.estado, estado)
    assert.equal(procesar.llamadas.length, 0, `${estado}: no se cargó nada`)
    assert.ok(!port.q.some((x) => /insert into public\.efectivo_comprobante/.test(x.sql)), `${estado}: no registró el ticket`)
  }
})

test('con número y permiso: registra el ticket con SU post, fuerza «A rendir» pagado, obra de la entrega y avisa en el hilo', async () => {
  const port = portFalso({ remitente: EMI })
  const procesar = procesarEspia()
  const r = await especialista.atender({ ...REAL_1704, texto: 'er 20', port, procesar, tanda: tandaEspia(), intencion: { destino: 'cargar' } })
  const ins = port.q.find((x) => /insert into public\.efectivo_comprobante/.test(x.sql))
  assert.deepEqual(ins.args, ['e20', REAL_1704.postId, 'uEmi'])
  const idxIns = port.q.indexOf(ins)
  const idxVinc = port.q.findIndex((x) => /vincular_rendiciones_pendientes/.test(x.sql))
  assert.ok(idxIns < idxVinc, 'registra antes y vincula después')
  const { mensaje } = procesar.llamadas[0]
  assert.deepEqual(mensaje.forzar, { formaPago: 'A rendir', pagado: true })
  assert.equal(mensaje.texto, 'OB-0031 Galpón 9')
  assert.equal(mensaje.postId, REAL_1704.postId)
  assert.deepEqual(r.parte.imputaciones, ['Imputado a **ER-0020** (@emiliano) · a rendir'])
  assert.match(textoTanda(r.parte), /ℹ Imputado a \*\*ER-0020\*\* \(@emiliano\) · a rendir/)
  assert.doesNotMatch(r.parte.imputaciones[0], /\$/, 'sin plata en el canal')
})

test('el cierre dice lo que pasó: vinculado, en espera, ya estaba o nada', () => {
  const e = ENTREGA
  assert.equal(cierreDeImputacion({ entrega: e, vinculadas: 2, parte: { yaEstaban: 1 } }).linea,
    'Imputado a **ER-0020** (@emiliano) · a rendir · 1 ya estaba en Compras y no se imputó: se hace desde la ficha de la entrega')
  assert.equal(cierreDeImputacion({ entrega: e, vinculadas: 0, enEspera: true }).descartar, false)
  const ya = cierreDeImputacion({ entrega: e, vinculadas: 0, parte: { yaEstaban: 1, cargados: 0 } })
  assert.equal(ya.descartar, true)
  assert.match(ya.linea, /Imputar un comprobante ya cargado/)
  assert.equal(cierreDeImputacion({ entrega: e, vinculadas: 0, parte: {} }).descartar, true)
  assert.match(cierreDeImputacion({ entrega: { ...e, mm_usuario: null } }).linea, /Emiliano Maldonado/)
})
