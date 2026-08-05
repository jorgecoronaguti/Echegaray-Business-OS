// LOS BOTONES Y LA IMPORTACIÓN — donde este módulo deja de leer y empieza a escribir.
//
// Todo lo de acá defiende una escritura con efecto económico: importar movimientos cambia el saldo de
// CAJA. Los casos son los que ya lastimaron a este repo en otros lados: el callback sin identidad, el
// doble click, la cadena de saldos que no cierra, y la evidencia que es el eco del que escribió en
// vez del dato leído en su destino.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearManejadorArchivos, TEXTO } from './accion.mjs'
import { importarExtracto, TEXTO as TEXTO_IMP } from './importacion.mjs'
import { repoMemoria, portGuarda, portCaido, mattermostFalso } from './dobles.mjs'
import { puedeImportarBanco } from './guarda.mjs'

const SECRETO = 'secreto-de-prueba'
const MOVS = [
  { fecha: '2026-07-22', concepto: 'Transferencia recibida', importe: 1000000, saldo: 5000000, referencia: '8689' },
  { fecha: '2026-07-23', concepto: 'Pago proveedores', importe: -500000, saldo: 4500000, referencia: '8690' },
]

async function conPropuesta(movimientos = MOVS) {
  const repo = repoMemoria()
  const fila = await repo.registrar(null, {
    fileId: 'f1', nombre: 'extracto.csv', formato: 'csv', destino: 'banco', estado: 'propuesto',
    propuesta: { movimientos, rechazos: [], cadena: { ok: true, cortes: [] } },
  })
  return { repo, fila }
}

const click = (extra = {}) => ({
  user_id: 'u1', channel_id: 'c1', channel_type: 'P', post_id: 'p1',
  context: { accion: 'importar', archivo: 'arch-1' },
  _secreto: SECRETO,
  ...extra,
})

// ── LA PUERTA ───────────────────────────────────────────────────────────────────────────────────

test('SIN EL SECRETO no se atiende: el callback de Mattermost no trae identidad', async () => {
  const { repo } = await conPropuesta()
  const manejar = crearManejadorArchivos({ port: portGuarda(), secreto: SECRETO, repo })
  const r = await manejar(click({ _secreto: 'otro' }))
  assert.match(r.body.ephemeral_text, /no pude verificar que este pedido venga de Mattermost/i)
  assert.equal([...repo.filas.values()][0].estado, 'propuesto', 'no se tocó nada')
})

test('SIN SECRETO CONFIGURADO tampoco: falla cerrado en los dos sentidos', async () => {
  const manejar = crearManejadorArchivos({ port: portGuarda(), secreto: null, repo: (await conPropuesta()).repo })
  const r = await manejar(click())
  assert.match(r.body.ephemeral_text, /todavía no está configurada/)
})

test('DESDE OTRO CANAL no se importa, aunque el secreto esté bien', async () => {
  const { repo } = await conPropuesta()
  const manejar = crearManejadorArchivos({ port: portGuarda({ canal: 'canal-oficial' }), secreto: SECRETO, repo })
  const r = await manejar(click({ channel_id: 'canal-cualquiera' }))
  assert.match(r.body.ephemeral_text, /canal de Administración y Finanzas/)
  assert.equal([...repo.filas.values()][0].estado, 'propuesto')
})

test('UN DM NO ES EL CANAL OFICIAL DE NADA, y se descarta sin gastar una consulta', async () => {
  let consultas = 0
  const port = { async query() { consultas++; return { rows: [] } } }
  const r = await puedeImportarBanco({ port, actor: { plataforma_user_id: 'u1', channel_type: 'D' }, channelId: 'dm' })
  assert.equal(r.ok, false)
  assert.equal(consultas, 0)
})

test('LA BASE CAÍDA DENIEGA: fail-closed, no fail-open', async () => {
  const r = await puedeImportarBanco({ port: portCaido(), actor: { plataforma_user_id: 'u1', channel_type: 'P' }, channelId: 'c1' })
  assert.equal(r.ok, false)
  assert.match(r.texto, /No pude confirmar/)
})

// ── EL DOBLE CLICK ──────────────────────────────────────────────────────────────────────────────

test('DOS CLICKS SEGUIDOS IMPORTAN UNA VEZ: el estado es un compare-and-set', async () => {
  const { repo } = await conPropuesta()
  let corridas = 0
  const manejar = crearManejadorArchivos({
    port: portGuarda(), secreto: SECRETO, repo,
    importar: async () => { corridas++; return { ok: true, insertados: 2, releidos: MOVS, texto: 'listo', total: 2 } },
  })
  const [a, bb] = await Promise.all([manejar(click()), manejar(click())])
  assert.equal(corridas, 1, 'el segundo click no encuentra nada que tomar')
  const respuestas = [a, bb].map((r) => JSON.stringify(r.body))
  assert.equal(respuestas.filter((s) => s.includes('listo')).length, 1)
  assert.equal([...repo.filas.values()][0].estado, 'importado')
})

test('DESCARTAR cierra sin escribir nada', async () => {
  const { repo } = await conPropuesta()
  const mm = mattermostFalso({})
  const manejar = crearManejadorArchivos({
    port: portGuarda(), mattermost: mm, secreto: SECRETO, repo,
    importar: async () => { throw new Error('no se debería haber llamado') },
  })
  const r = await manejar(click({ context: { accion: 'descartar', archivo: 'arch-1' } }))
  assert.match(JSON.stringify(r.body), /Descartado/)
  assert.equal([...repo.filas.values()][0].estado, 'descartado')
  assert.equal(mm.actualizados.length, 1, 'el mensaje con botones se reescribe')
})

test('un archivo que ya no está se contesta, no revienta', async () => {
  const manejar = crearManejadorArchivos({ port: portGuarda(), secreto: SECRETO, repo: repoMemoria() })
  const r = await manejar(click({ context: { accion: 'importar', archivo: 'no-existe' } }))
  assert.equal(r.body.ephemeral_text, TEXTO.SIN_ARCHIVO)
})

test('si la importación falla, la propuesta vuelve a quedar disponible para reintentar', async () => {
  const { repo } = await conPropuesta()
  const manejar = crearManejadorArchivos({
    port: portGuarda(), secreto: SECRETO, repo,
    importar: async () => ({ ok: false, texto: 'no pude', error: 'cadena_rota', insertados: 0, releidos: [] }),
  })
  await manejar(click())
  assert.equal([...repo.filas.values()][0].estado, 'propuesto')
})

// ── LA ESCRITURA Y SU EVIDENCIA ─────────────────────────────────────────────────────────────────

test('LA EVIDENCIA ES EL DATO RELEÍDO DEL DESTINO, no el contador del importador', async () => {
  const { fila } = await conPropuesta()
  const releidas = []
  const r = await importarExtracto({
    port: null,
    cargados: async () => [],
    insertar: async (_p, movs) => ({ insertados: movs.length, ids: [101, 102] }),
    // El relector devuelve algo DISTINTO de lo que se mandó a escribir, a propósito: si el mensaje
    // se armara con lo que se intentó escribir, este test pasaría igual y no probaría nada.
    releer: async (_p, ids) => { releidas.push(...ids); return [{ fecha: '2026-07-22', concepto: 'LO QUE QUEDÓ EN LA BASE', importe: 1000000, saldo: 5000000 }] },
    estado: async () => ({ total: 172, cobertura: '2026-07-23' }),
  }, fila)

  assert.equal(r.ok, true)
  assert.deepEqual(releidas, [101, 102], 'se releyó por los ids que devolvió Postgres')
  assert.match(r.texto, /Releído de la base/)
  assert.match(r.texto, /LO QUE QUEDÓ EN LA BASE/)
  assert.match(r.texto, /172 movimiento/)
})

test('LA CADENA DE SALDOS SE VUELVE A VERIFICAR AL IMPORTAR, no se confía en el veredicto guardado', async () => {
  const rotos = [
    { fecha: '2026-07-22', concepto: 'A', importe: 1000000, saldo: 5000000, referencia: '1' },
    { fecha: '2026-07-23', concepto: 'B', importe: -500000, saldo: 4000000, referencia: '2' },
  ]
  const { fila } = await conPropuesta(rotos)
  // La propuesta guardada MIENTE (dice que cierra). El control se hace igual.
  const r = await importarExtracto({
    port: null,
    cargados: async () => [],
    insertar: async () => { throw new Error('no se debería haber escrito') },
    releer: async () => [],
    estado: async () => ({ total: 0, cobertura: null }),
  }, fila)
  assert.equal(r.ok, false)
  assert.equal(r.error, 'cadena_rota')
  assert.equal(r.texto, TEXTO_IMP.CADENA_ROTA)
})

test('SE DEDUPLICA CONTRA LO QUE HAY AHORA, no contra lo que había al previsualizar', async () => {
  const { fila } = await conPropuesta()
  const r = await importarExtracto({
    port: null,
    // Entre la previsualización y el click entró el mismo extracto por la terminal.
    cargados: async () => MOVS,
    insertar: async () => { throw new Error('no se debería haber escrito') },
    releer: async () => [],
    estado: async () => ({ total: 2, cobertura: '2026-07-23' }),
  }, fila)
  assert.equal(r.ok, true)
  assert.equal(r.insertados, 0)
  assert.match(r.texto, /No cargué nada nuevo/)
})

test('una propuesta sin movimientos no escribe nada', async () => {
  const { fila } = await conPropuesta([])
  const r = await importarExtracto({ port: null }, fila)
  assert.equal(r.ok, false)
  assert.equal(r.texto, TEXTO_IMP.SIN_MOVIMIENTOS)
})

// ── EL CABLEADO HTTP ────────────────────────────────────────────────────────────────────────────

test('LA RUTA EXISTE Y EL SECRETO VIAJA EN LA QUERY, no en el cuerpo', async () => {
  // Un manejador perfecto detrás de una ruta que nadie montó es una capacidad que no existe. Y el
  // secreto sale de `?t=`: es lo único que Mattermost puede presentar y el cliente no.
  const { crearServidorAsistencia, RUTA_ARCHIVOS_DEFAULT } = await import('../servidor-asistencia.mjs')
  const vistos = []
  const server = crearServidorAsistencia({
    manejarAccion: async () => ({ status: 200, body: {} }),
    manejarArchivos: async (p) => { vistos.push(p); return { status: 200, body: { ok: true } } },
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port: puerto } = server.address()
  const url = `http://127.0.0.1:${puerto}${RUTA_ARCHIVOS_DEFAULT}?t=${SECRETO}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: 'u1', context: { accion: 'importar', archivo: 'arch-1' } }),
  })
  const perdida = await fetch(`http://127.0.0.1:${puerto}/archivos/otra`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  server.close()

  assert.equal(res.status, 200)
  assert.equal(vistos[0]._secreto, SECRETO, 'el secreto llega desde la query')
  assert.equal(vistos[0].context.accion, 'importar')
  assert.equal(perdida.status, 404, 'no hay pantalla: todo lo demás es 404')
})

test('la propuesta puede venir como texto (según el driver) y se lee igual', async () => {
  const fila = { nombre: 'x.csv', propuesta: JSON.stringify({ movimientos: MOVS }) }
  const r = await importarExtracto({
    port: null,
    cargados: async () => [],
    insertar: async (_p, movs) => ({ insertados: movs.length, ids: [1, 2] }),
    releer: async () => MOVS,
    estado: async () => ({ total: 2, cobertura: '2026-07-23' }),
  }, fila)
  assert.equal(r.insertados, 2)
})
