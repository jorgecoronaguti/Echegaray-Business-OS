// EL WORKER APLICANDO UN PAGO, con dobles en memoria: sin Postgres, sin Google, sin el Sheet real.
//
// Lo que se prueba es lo que separa «escribí» de «quedó escrito»: que las celdas viajen en UN solo
// batch (una fila a medias es un dato falso), que el freno se levante con el nombre de quien pidió, y
// que un pago no se cierre como aplicado si la fila releída no lo confirma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCambio } from './cola-obra.mjs'
import { COMPRAS_CON_OBRA } from '../../lib/encabezados-referencia.mjs'
import { rangoEncabezado } from '../../lib/columnas-por-encabezado.mjs'
import { claveDeCompra } from '../../lib/compras-fila.mjs'
import { planDePago } from '../../lib/pagos-de-compra.mjs'

const COMPRA = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345',
  'CUIT (OS)': '30712345678', Total: 121000, Estado: 'Pendiente',
}
const CLAVE = claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' })

function filaDe(valores) {
  const f = new Array(COMPRAS_CON_OBRA.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[COMPRAS_CON_OBRA.indexOf(rotulo)] = v
  return f
}

/** El plan sale de la función de PRODUCCIÓN: unas celdas escritas a mano saltarían el defecto real. */
const PLAN = planDePago({
  compra: {
    fila: 57, total: 121000, monto_pagado: 0, monto_parcial_2: 0, pago_total_o_parcial: null,
    tipo_pago: null, estado: 'Pendiente', fecha_prevista: '2026-09-30', fecha_prevista_2: null,
    saldo_pendiente: 121000, anulada: false,
  },
  accion: { tipo: 'total', fecha: '2026-09-16', medio: 'Transferencia' },
  hoy: '2026-09-16',
})
const CAMBIO = {
  id: 'p-1', fila: 57, sheet_id: 53, clave: CLAVE, pestana: 'Compras', tipo: 'pago',
  celdas: PLAN.celdas, valor_nuevo: 'total', pedido_por: 'u-1', intentos: 1,
}
/** Cómo queda la fila del Sheet después de un pago total que aterrizó. */
const YA_PAGADA = { ...COMPRA, 'Monto Pagado': 121000, 'Total o Parcial': 'Total', Estado: 'Pagado', 'Tipo pago': 'Transferencia' }

/** Google en memoria. `despues` = qué dice la fila cuando el worker la relee para probar el efecto. */
function dobleGoogle({ antes = COMPRA, despues = YA_PAGADA, respuesta = {}, fallaRelectura = false } = {}) {
  const escrituras = []; const lecturas = []
  return {
    escrituras, lecturas,
    async readSheetValues(_id, rango, opts) {
      lecturas.push({ rango, opts })
      if (rango === rangoEncabezado('Compras')) return [COMPRAS_CON_OBRA]
      if (fallaRelectura && escrituras.length) throw new Error('red caída')
      return [filaDe(escrituras.length ? despues : antes)]
    },
    async batchUpdateValues(_id, data, opts) { escrituras.push({ data, opts }); return respuesta },
  }
}

function doblePort({ perfil = { nombre: 'Rodrigo' } } = {}) {
  const updates = []
  return {
    updates,
    async query(sql, params) {
      if (/from public\.perfiles/.test(sql)) return { rows: perfil ? [perfil] : [] }
      if (/set estado/.test(sql)) { updates.push({ sql, params }); return { rows: [] } }
      return { rows: [] }
    },
  }
}
const ultimo = (port) => port.updates.at(-1)

test('el plan de la fixture existe: sin él todas las pruebas de abajo serían triviales', () => {
  assert.ok(PLAN.celdas?.length >= 3, 'planDePago tiene que devolver las celdas del pago total')
})

test('las celdas del pago viajan en UN solo batch: una fila a medias es un dato falso', async () => {
  const google = dobleGoogle(); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 1, 'un solo batchUpdateValues')
  const rangos = google.escrituras[0].data.map((d) => d.range).sort()
  assert.deepEqual(rangos, ['Compras!Q57', 'Compras!T57', 'Compras!U57', 'Compras!Y57'])
  assert.equal(ultimo(port).params[1], 'aplicado')
})

test('el freno de mano se levanta con el NOMBRE de quien registró el pago', async () => {
  const google = dobleGoogle()
  await aplicarCambio({ port: doblePort(), google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  const c = google.escrituras[0].opts.confirmacion
  assert.equal(c.actor, 'Rodrigo')
  assert.match(c.motivo, /pago de la fila 57/)
})

test('sin persona identificada NO se escribe el Sheet', async () => {
  const google = dobleGoogle()
  const r = await aplicarCambio({ port: doblePort({ perfil: null }), google, fileId: 'F', cambio: { ...CAMBIO, pedido_por_nombre: null }, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
})

test('la fila se relee sin formato: con formato, un importe vuelve como texto con puntos', async () => {
  const google = dobleGoogle()
  await aplicarCambio({ port: doblePort(), google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  for (const l of google.lecturas.filter((x) => x.rango.includes('A57:'))) {
    assert.equal(l.opts?.render, 'UNFORMATTED_VALUE')
  }
})

test('si la fila releída NO confirma el pago, se cierra en error y no como aplicado', async () => {
  // La escritura «anduvo» (la API no se quejó) pero la fila sigue diciendo Pendiente.
  const google = dobleGoogle({ despues: { ...YA_PAGADA, Estado: 'Pendiente' } })
  const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'error')
  assert.equal(ultimo(port).params[1], 'error')
  assert.match(ultimo(port).params[2], /relectura distinta/)
})

test('si no se puede releer, el pago vuelve a la cola: no se finge el cierre', async () => {
  const google = dobleGoogle({ fallaRelectura: true })
  const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'error')
  assert.equal(ultimo(port).params[1], 'pendiente', 'con intentos disponibles vuelve a pendiente')
  assert.match(ultimo(port).params[2], /sin evidencia no se cierra/)
})

test('con el freno de mano puesto no se escribe y el pago queda pendiente', async () => {
  const google = dobleGoogle({ respuesta: { congelado: true } })
  const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'diferido')
  assert.match(ultimo(port).params[1], /freno de mano/)
})

test('la fila que dejó de ser la misma compra no recibe el pago', async () => {
  const google = dobleGoogle({ antes: { ...COMPRA, 'N° Comprobante': '0003-00099999' } })
  const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
})

test('el reintento de un pago que ya aterrizó se cierra sin volver a escribir', async () => {
  const google = dobleGoogle({ antes: YA_PAGADA })
  const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 0)
})

test('un pago no le pide el catálogo de obras a la base: no lo necesita', async () => {
  const sqls = []
  const port = {
    updates: [],
    async query(sql, params) {
      sqls.push(sql)
      if (/from public\.perfiles/.test(sql)) return { rows: [{ nombre: 'Rodrigo' }] }
      if (/set estado/.test(sql)) { port.updates.push({ sql, params }); return { rows: [] } }
      return { rows: [] }
    },
  }
  await aplicarCambio({ port, google: dobleGoogle(), fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(sqls.some((s) => /obra_canonica/.test(s)), false)
})
