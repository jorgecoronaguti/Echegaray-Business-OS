// El worker se prueba con dobles en memoria: sin Postgres, sin Google y sin acercarse al Sheet real.
// Lo que se verifica es el reparto de estados y —sobre todo— que NO escriba cuando no debe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCambio, procesarCola, tomarCambio } from './cola-cambios.mjs'

const FILA_SANA = [
  null, null, null, null, '01-000048', null, null, null, null, '7520000', null, null,
  null, 'Transferencia', 'Pendiente', null, '46265', null, null, null, null, null, 'nota del dueño',
]
const FORMULAS_SANAS = [
  null, null, null, null, '01-000048', null, null, null, null, '7520000', '=J49*0,21',
  '=IF(SUM(X49:AA49)=0;"";SUM(X49:AA49))', '=J49+K49-L49', 'Transferencia', 'Pendiente', null,
  '=P49+75', null, null, null, null, null, 'nota del dueño',
]

function dobleGoogle({ fila = FILA_SANA, formulas = FORMULAS_SANAS, respuesta = {} } = {}) {
  const escrituras = []
  return {
    escrituras,
    async readSheetValues(_id, rango, opts) {
      if (rango.includes(':')) return [opts?.render === 'FORMULA' ? formulas : fila]
      return [['46265']]                       // la relectura de la celda escrita
    },
    async batchUpdateValues(_id, data, opts) {
      escrituras.push({ data, opts })
      return respuesta
    },
  }
}

function doblePort({ perfil = { nombre: 'Rodrigo', rol: 'administracion' }, cambios = [] } = {}) {
  const updates = []
  const cola = [...cambios]
  return {
    updates,
    async query(sql, params) {
      if (/from public\.perfiles/.test(sql)) return { rows: perfil ? [perfil] : [] }
      if (/set estado = 'procesando'/.test(sql)) {
        const c = cola.shift()
        return { rows: c ? [c] : [] }
      }
      if (/set estado =/.test(sql)) { updates.push({ sql, params }); return { rows: [] } }
      return { rows: [] }
    },
  }
}

const CAMBIO = {
  id: 'c-1', cobranza_fila: 49, campo: 'fecha', valor_nuevo: '2026-09-15',
  huella_comprobante: '01-000048', huella_monto: 7520000, pedido_por: 'u-1', intentos: 1,
}

test('el camino feliz escribe Q y W, y guarda lo RELEÍDO de la celda', async () => {
  const google = dobleGoogle(); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  assert.equal(r, 'aplicado')
  const rangos = google.escrituras[0].data.map((d) => d.range)
  assert.deepEqual(rangos, ['Cobranzas!Q49', 'Cobranzas!W49'])
  const cierre = port.updates.at(-1)
  assert.equal(cierre.params[1], 'aplicado')
  assert.equal(cierre.params[3], '46265', 'leido_de_vuelta es lo que dice la celda, no lo que se mandó')
})

test('la nota del dueño se conserva: W se escribe con lo viejo MÁS la traza', async () => {
  const google = dobleGoogle(); const port = doblePort()
  await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  const w = google.escrituras[0].data.find((d) => d.range === 'Cobranzas!W49')
  assert.match(w.values[0][0], /^nota del dueño\n/)
  assert.match(w.values[0][0], /Rodrigo/)
})

test('el freno se levanta con el NOMBRE de quien apretó el botón, no con el del worker', async () => {
  const google = dobleGoogle(); const port = doblePort()
  await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  const { confirmacion } = google.escrituras[0].opts
  assert.equal(confirmacion.actor, 'Rodrigo')
  assert.ok(confirmacion.motivo.length >= 8, 'el congelador exige un motivo de verdad')
})

test('sin usuario identificado NO se escribe nada: el Sheet no se toca sin nombre', async () => {
  const google = dobleGoogle(); const port = doblePort({ perfil: null })
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
})

test('si la fila corrió de lugar, se RECHAZA y no se escribe una sola celda', async () => {
  // Alguien insertó una fila: la 49 ahora tiene otro comprobante.
  const otra = [...FILA_SANA]; otra[4] = '01-000099'
  const google = dobleGoogle({ fila: otra }); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0, 'ni la nota se escribe')
  assert.match(port.updates.at(-1).params[2], /huella_distinta/)
})

test('un cambio de monto sobre una fila con IVA literal se rechaza nombrando la celda', async () => {
  const fLit = [...FORMULAS_SANAS]; fLit[10] = '1999200'      // K literal, como la fila 5 real
  const google = dobleGoogle({ formulas: fLit }); const port = doblePort()
  const r = await aplicarCambio({
    port, google, fileId: 'F',
    cambio: { ...CAMBIO, campo: 'monto', valor_nuevo: '8000000' },
  })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(port.updates.at(-1).params[2], /iva_literal.*K49/)
})

test('con el freno puesto el cambio vuelve a PENDIENTE, no a error: se aplica solo al levantarlo', async () => {
  const google = dobleGoogle({ respuesta: { congelado: true } }); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO })
  assert.equal(r, 'diferido')
  const u = port.updates.at(-1)
  assert.equal(u.params[1], 'pendiente')
  assert.match(u.params[2], /freno de mano/)
})

test('una pestaña candada también difiere, no marca error', async () => {
  const google = dobleGoogle({ respuesta: { protegido: true, motivo: 'candado' } })
  const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO }), 'diferido')
  assert.equal(port.updates.at(-1).params[1], 'pendiente')
})

test('procesarCola cuenta lo que hizo y se detiene cuando la cola se vacía', async () => {
  const google = dobleGoogle()
  const port = doblePort({ cambios: [CAMBIO, { ...CAMBIO, id: 'c-2' }] })
  const cuenta = await procesarCola({ port, google, fileId: 'F', max: 10 })
  assert.equal(cuenta.aplicado, 2)
  assert.equal(cuenta.rechazado, 0)
  assert.equal(google.escrituras.length, 2)
})

test('una falla técnica con reintentos disponibles vuelve a pendiente; agotados, queda en error', async () => {
  const roto = { ...dobleGoogle(), readSheetValues: async () => { throw new Error('red caída') } }
  const port = doblePort({ cambios: [{ ...CAMBIO, intentos: 1 }] })
  await procesarCola({ port, google: roto, fileId: 'F', max: 1 })
  assert.equal(port.updates.at(-1).params[1], 'pendiente')

  const roto2 = { ...dobleGoogle(), readSheetValues: async () => { throw new Error('red caída') } }
  const port2 = doblePort({ cambios: [{ ...CAMBIO, intentos: 3 }] })
  await procesarCola({ port: port2, google: roto2, fileId: 'F', max: 1 })
  assert.equal(port2.updates.at(-1).params[1], 'error')
})

test('tomarCambio marca procesando en el MISMO update: dos workers no se llevan el mismo cobro', async () => {
  let sql = null
  const port = { async query(s) { sql = s; return { rows: [CAMBIO] } } }
  await tomarCambio(port)
  assert.match(sql, /for update skip locked/i)
  assert.match(sql, /set estado = 'procesando'/)
})
