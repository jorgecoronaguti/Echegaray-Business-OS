// CORREGIR FECHA Y CONCEPTO DE UNA RENDICIÓN DESDE LA APP (dueño, 30/09/2026) — el worker sobre una fila SIMULADA.
//
// Nada de esto toca el Sheet real: Google es un doble en memoria que aplica las escrituras sobre una fila
// propia, así la relectura prueba el efecto (la celda dice lo pedido) y no la respuesta del doble.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCambio } from './cola-obra.mjs'
import { COMPRAS_CON_OBRA } from '../../lib/encabezados-referencia.mjs'
import { rangoEncabezado } from '../../lib/columnas-por-encabezado.mjs'
import { claveDeCompra } from '../../lib/compras-fila.mjs'
import { planificarDetalle, fechaParaElSheet } from '../../lib/bisturi-compras-detalle.mjs'

const ENC = COMPRAS_CON_OBRA
const SERIAL_10_SEP = 46275 // 10/09/2026, el mismo serial que usa el test del respaldo de la cola
const SERIAL_12_SEP = SERIAL_10_SEP + 2
const BASE = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345', 'CUIT (OS)': '30712345678',
  'Fecha factura': SERIAL_10_SEP, Concepto: 'Cemento', Total: 1000, 'Tipo pago': 'A rendir', Estado: 'Pagado',
  'Monto Pagado': 1000, 'Fecha prevista de pago (día)': SERIAL_10_SEP,
}
const CAMBIO = {
  id: 'd-1', fila: 57, sheet_id: 53, tipo: 'detalle', pedido_por: 'u-1', intentos: 1,
  clave: claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' }),
  celdas: { fecha: '2026-09-12', concepto: 'Cemento Loma Negra' },
  previo: { fecha: '2026-09-10', concepto: 'Cemento' },
}

const colDe = (letras) => [...letras].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1

function filaDe(valores) {
  const f = new Array(ENC.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[ENC.indexOf(rotulo)] = v
  return f
}

/** Google con UNA fila viva: las escrituras se aplican sobre ella (fecha dd/mm/aaaa → serial) y se anotan. */
function googleConFila(valores) {
  const fila = filaDe(valores); const escrituras = []
  return {
    escrituras, fila,
    async readSheetValues(_id, rango) {
      if (rango === rangoEncabezado('Compras')) return [ENC]
      return [[...fila]]
    },
    async batchUpdateValues(_id, data, opts) {
      escrituras.push({ data, opts })
      for (const { range, values } of data) {
        const [, letras] = /^Compras!([A-Z]+)\d+$/.exec(range)
        const v = values[0][0]
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
        fila[colDe(letras)] = m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) + 25569 : v
      }
      return {}
    },
  }
}

function doblePort() {
  const updates = []
  return {
    updates,
    async query(sql, params) {
      if (/from public\.perfiles/.test(sql)) return { rows: [{ nombre: 'Rodrigo' }] }
      if (/set estado/.test(sql)) updates.push({ sql, params })
      return { rows: [] }
    },
  }
}
const ultimo = (port) => port.updates.at(-1)
const aplicar = (google, cambio = CAMBIO, port = doblePort()) =>
  aplicarCambio({ port, google, fileId: 'F', cambio, encabezado: ENC }).then((r) => ({ r, port }))

test('detalle: escribe SÓLO Fecha factura y Concepto, relee la fila y cierra', async () => {
  const google = googleConFila(BASE)
  const { r, port } = await aplicar(google)
  assert.equal(r, 'aplicado')
  const rangos = google.escrituras.flatMap((e) => e.data.map((d) => d.range))
  assert.equal(rangos.length, 2)
  const letraDe = (rotulo) => rangos.find((x) => x.endsWith('57') && colDe(/^Compras!([A-Z]+)/.exec(x)[1]) === ENC.indexOf(rotulo))
  assert.ok(letraDe('Fecha factura') && letraDe('Concepto'))
  // La plata de la fila y sus columnas de pago quedan EXACTAMENTE como estaban.
  for (const rotulo of ['Total', 'Tipo pago', 'Estado', 'Monto Pagado', 'Fecha prevista de pago (día)', 'Proveedor']) {
    assert.equal(google.fila[ENC.indexOf(rotulo)], BASE[rotulo], rotulo)
  }
  assert.equal(google.fila[ENC.indexOf('Fecha factura')], SERIAL_12_SEP)
  assert.equal(google.fila[ENC.indexOf('Concepto')], 'Cemento Loma Negra')
  assert.match(google.escrituras[0].opts.confirmacion.motivo, /corregidos en la app por Rodrigo/)
  assert.equal(ultimo(port).params[1], 'aplicado')
})

test('detalle: si sólo pidió el concepto, la fecha no se escribe', async () => {
  const google = googleConFila(BASE)
  const cambio = { ...CAMBIO, celdas: { concepto: 'Cemento Loma Negra' }, previo: { concepto: 'Cemento' } }
  const { r } = await aplicar(google, cambio)
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras[0].data.length, 1)
  assert.equal(google.fila[ENC.indexOf('Fecha factura')], SERIAL_10_SEP)
})

test('detalle: una fila que NO es A rendir la cargó una persona y se RECHAZA sin escribir', async () => {
  const google = googleConFila({ ...BASE, 'Tipo pago': 'Efectivo' })
  const { r, port } = await aplicar(google)
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /no_es_a_rendir/)
})

test('detalle: si la fila ya dice lo pedido no se vuelve a escribir', async () => {
  const google = googleConFila({ ...BASE, 'Fecha factura': SERIAL_12_SEP, Concepto: 'Cemento Loma Negra' })
  const { r } = await aplicar(google)
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 0)
})

test('detalle: si alguien cambió el concepto desde que la pantalla lo vio, no lo piso', async () => {
  const google = googleConFila({ ...BASE, Concepto: 'Cemento (corregido a mano)' })
  const { r, port } = await aplicar(google)
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /celda_cambio/)
})

test('detalle: si la fila ya es otra compra, se RECHAZA', async () => {
  const google = googleConFila({ ...BASE, 'N° Comprobante': '0001-00000001' })
  const { r } = await aplicar(google)
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
})

test('detalle: pedir el proveedor, el importe o el pago NO se escribe: la lista blanca es fecha y concepto', async () => {
  for (const campo of ['proveedor', 'total', 'estado', 'tipo_pago']) {
    const google = googleConFila(BASE)
    const { r } = await aplicar(google, { ...CAMBIO, celdas: { [campo]: 'X' }, previo: {} })
    assert.equal(r, 'rechazado', campo)
    assert.equal(google.escrituras.length, 0, campo)
  }
})

test('detalle: la relectura distinta deja error y no aplicado', async () => {
  const google = googleConFila(BASE)
  const escribir = google.batchUpdateValues.bind(google)
  google.batchUpdateValues = async (...a) => { await escribir(...a); google.fila[ENC.indexOf('Concepto')] = 'otra cosa'; return {} }
  const { r, port } = await aplicar(google)
  assert.equal(r, 'error')
  assert.equal(ultimo(port).params[1], 'error')
})

test('detalle: el freno de mano difiere y no escribe nada más', async () => {
  const google = googleConFila(BASE)
  google.batchUpdateValues = async (_i, data) => { google.escrituras.push({ data }); return { congelado: true } }
  const { r } = await aplicar(google)
  assert.equal(r, 'diferido')
})

test('detalle: el plan puro traduce la fecha ISO a dd/mm/aaaa y rechaza una que no lo es', () => {
  assert.equal(fechaParaElSheet('2026-09-12'), '12/09/2026')
  assert.equal(fechaParaElSheet('mañana'), null)
  const plan = planificarDetalle({
    cambio: { ...CAMBIO, celdas: { fecha: 'mañana' } }, encabezado: ENC, fila: filaDe(BASE),
  })
  assert.equal(plan.accion, 'rechazar')
})
