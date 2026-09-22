// La libreta cargada desde el chat (22/09/2026). Lo que se prueba: que cada línea termine en Compras como
// pagada en efectivo, que los jornales NO entren, y que la misma línea no se pueda cargar dos veces.
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista, itemDeLinea, textoDeRespuesta } from './libreta.mjs'
import { interpretarLinea } from '../../lib/libreta-texto.mjs'
import { estaCompleto } from '../../lib/comprobantes/fajo.mjs'

const HOY = new Date('2026-09-22T12:00:00Z')
const actor = { plataforma_user_id: 'mm1', channel_id: 'ch1' }

function portFalso({ canal = true, perfil = 'perf-1' } = {}) {
  return {
    async query(sql) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ canal_nombre: 'Efectivo' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: perfil ? [{ perfil_id: perfil, rol: 'direccion', nombre: 'Jorge' }] : [] }
      return { rows: [] }
    },
  }
}

test('la línea entra a Compras pagada en efectivo, con el concepto escrito y marcada sin comprobante', () => {
  const it = itemDeLinea(interpretarLinea('P. TELLO (18/9) 2.640.000', HOY))
  assert.deepEqual(it.comprobante, {
    fecha: '2026-09-18', concepto: 'P TELLO · sin comprobante', total: 2640000,
    formaPago: 'Efectivo', condicion: 'Contado', pagado: 2640000,
  })
  assert.equal(it.clave, 'l:2026-09-18|p-tello|264000000')
  // Y el cargador la acepta: sin la política de la libreta, una fila sin número ni proveedor no entraría.
  assert.equal(estaCompleto(it), true)
  assert.equal(estaCompleto({ ...it, origenCarga: undefined }), false, 'por el canal de comprobantes NO entraría')
})

test('carga la hoja entera en un solo fajo y contesta línea por línea', async () => {
  const hoja = ['P. TELLO (18/9) 2.640.000', 'Flete 19/9 60.000', 'Jornales sabado 19/9 374.000'].join('\n')
  let abierto = null
  const r = await especialista.atender({
    texto: hoja, port: portFalso(), actor,
    abrir: async (_p, f) => { abierto = f; return { id: 'f1', items: f.items, plataforma_username: f.username } },
    escribir: async () => ({ estado: 'cargado', texto: '✔ 2 filas en Compras.' }),
  })
  assert.equal(abierto.items.length, 2, 'los jornales no viajan al cargador')
  assert.equal(abierto.username, 'Jorge', 'el fajo lleva quién escribió: sin eso el freno de mano no se levanta')
  assert.match(r.texto, /P TELLO · 18\/09 · \$ 2\.640\.000/)
  assert.match(r.texto, /no la cargué.*Liquidación/)
  assert.equal(r.estado, 'cargado')
})

test('una línea sin importe NO se carga ni se reclama: no hay con qué escribir una fila', async () => {
  // Y tampoco se la roba a los demás especialistas: «P. Tello 18/9» puede ser cualquier cosa.
  assert.equal(await especialista.reconoce('P. Tello 18/9', { area: 'rendicion' }), null)
  let escribio = false
  const r = await especialista.atender({
    texto: 'P. Tello 18/9', port: portFalso(), actor,
    abrir: async () => ({ id: 'f1' }), escribir: async () => { escribio = true; return {} },
  })
  assert.equal(escribio, false)
  assert.match(r.texto, /una línea por pago/, 'contesta cómo se escribe')
})

test('la hoja con una línea buena y una sin importe carga la buena y nombra la otra', async () => {
  const r = await especialista.atender({
    texto: 'Flete 19/9 60.000\nP. Tello 18/9', port: portFalso(), actor,
    abrir: async (_p, f) => ({ id: 'f1', items: f.items }),
    escribir: async () => ({ estado: 'cargado', texto: '✔ 1 fila en Compras.' }),
  })
  assert.match(r.texto, /Flete · 19\/09/)
  assert.match(r.texto, /no entendí el importe/)
})

test('las puertas fallan cerrado: canal ajeno y usuario sin perfil', async () => {
  const linea = 'Flete 19/9 60.000'
  assert.equal((await especialista.atender({ texto: linea, port: portFalso({ canal: false }), actor })).estado, 'rechazado_canal')
  assert.equal((await especialista.atender({ texto: linea, port: portFalso({ perfil: null }), actor })).estado, 'rechazado_sin_perfil')
})

test('no reclama lo que no es suyo: una foto, un mensaje cualquiera, o el canal de compras', async () => {
  assert.equal(await especialista.reconoce('Flete 60.000', { area: 'compras' }), null)
  assert.equal(await especialista.reconoce('Flete 60.000', { area: 'rendicion', fileIds: ['f1'] }), null)
  assert.equal(await especialista.reconoce('hola, todo bien?', { area: 'rendicion' }), null)
  assert.equal((await especialista.reconoce('Flete 60.000', { area: 'rendicion' }))?.destino, 'libreta')
})

test('el resumen dice qué se cargó y qué no, sin inventar un total', () => {
  const t = textoDeRespuesta([{ linea: 'x', estado: 'jornales' }], 'No cargué nada.')
  assert.match(t, /Liquidación/)
  assert.doesNotMatch(t, /\$ 0/)
})
