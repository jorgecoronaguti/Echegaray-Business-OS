// LO QUE SALE PARA GOOGLE ES LO QUE LA GUARDA DEVOLVIÓ — no lo que entró.
//
// ═══ EL DEFECTO (03/09, auditoría de cierre de la propiedad por celda) ═══
//
// `updateSheetValues` llamaba a `guardarEscritura`, miraba SÓLO si `g.data` había quedado vacío… y
// después mandaba `range` + `values` ORIGINALES. Todo lo que la guarda decide sobre el CONTENIDO se
// tiraba: el recorte por celda y la re-inyección de celdas aprendidas.
//
// Lo que lo hacía peor que "no proteger": el log imprimía «✋ N celda(s) tuya(s) respetada(s)», la fila
// entraba en `sheet_reconciliacion_celda` como respetada, y la celda se pisaba igual. Una guarda que
// informa lo contrario de lo que hace es la que consigue que nadie vuelva a mirar.
//
// Este archivo mira EL BYTE QUE SALE A LA RED. No hay forma de que pase en verde sin que el recorte
// haya llegado hasta la llamada HTTP.
//
// Hermético: sin credenciales, sin red, sin Postgres.

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.ORQ_SHEETS_MARCA = path.join(os.tmpdir(), 'no-existe', 'SHEETS-CONGELADOS')
delete process.env.ORQ_SHEETS_DESCONGELAR

const { registerHooks } = await import('node:module')
const base = { huellas: [] }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbRecorte(...a)' }
  },
})
const sellos = []
globalThis.__dbRecorte = async (sql, params) => {
  const s = String(sql)
  if (/to_regclass/.test(s)) return { rows: [{ t: 'public.sheet_huella_celda' }] }
  if (/select fila, col, forma, huella/.test(s)) return { rows: base.huellas }
  if (/insert into public\.sheet_huella_celda/.test(s)) { sellos.push({ sql: s, params }); return { rows: [] } }
  return { rows: [] }
}

const { makeGoogleClient } = await import('./google.mjs')
const { formaDe } = await import('./huella-forma.mjs')
const { huellaDe } = await import('./huella-celda.mjs')

const TAB = 'Proveedores'
const RANGO = `${TAB}!A10:D12`

/** Lo que el generador quiere escribir, y lo que HOY hay en la hoja: D11 la escribió el dueño. */
const GENERADO = [
  ['Proveedor', 'Saldo', 'Vence', 'Qué hacer'],
  ['Acindar', '=SUM(B1:B2)', '2026-09-10', 'pagar el viernes'],
  ['Ferrum', '=SUM(C1:C2)', '2026-09-12', 'esperar'],
]
const VIVO = GENERADO.map((f) => [...f])
VIVO[1][3] = 'LLAMAR A JUAN'

function sembrarHuellas() {
  base.huellas = []
  GENERADO.forEach((f, i) => f.forEach((v, j) => {
    if (i === 1 && j === 3) return // D11 no es mía: la escribió él
    base.huellas.push({ fila: 10 + i, col: j, forma: formaDe(v), huella: huellaDe(v), valor: String(v), borrada_en: null, abandonada_en: null })
  }))
}

/**
 * Un Google falso que registra CADA llamada con su cuerpo. Las lecturas devuelven `VIVO` (la propiedad
 * por celda y no-borrar releen el destino); las escrituras contestan que sí.
 */
function armar() {
  const llamadas = []
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url)
    const metodo = opts.method ?? 'GET'
    const cuerpo = opts.body ? JSON.parse(opts.body) : null
    llamadas.push({ url: u, metodo, cuerpo })
    let json = {}
    if (/\/values\/.*\?/.test(u) && metodo === 'GET') json = { values: VIVO.map((f) => [...f]) }
    else if (/\?fields=/.test(u)) json = { properties: { locale: 'es_AR' }, sheets: [] }
    else if (metodo === 'PUT' || /values:batchUpdate/.test(u)) json = { updatedCells: 1 }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => json, text: async () => '{}' }
  }
  const cliente = makeGoogleClient({ fetchImpl, getToken: async () => 'token-de-prueba' })
  return { cliente, llamadas }
}

/** Todos los valores que efectivamente salieron para Google en esta corrida. */
function loEscrito(llamadas) {
  return llamadas
    .filter((l) => l.metodo === 'PUT' || (l.metodo === 'POST' && /values:batchUpdate/.test(l.url)))
    .flatMap((l) => (l.cuerpo?.data ?? [l.cuerpo]).flatMap((d) => (d?.values ?? []).flat()))
}

test('updateSheetValues NO manda a Google la celda que la guarda respetó', async () => {
  sembrarHuellas()
  const { cliente, llamadas } = armar()
  await cliente.updateSheetValues('FILE', RANGO, GENERADO.map((f) => [...f]))
  const escrito = loEscrito(llamadas)
  assert.ok(escrito.length, 'no salió ninguna escritura: el arnés no probó nada')
  assert.equal(escrito.includes('pagar el viernes'), false,
    'D11 la escribió el dueño y salió igual para Google: la guarda informa una cosa y hace otra')
  assert.ok(escrito.includes('Acindar'), 'y lo que sí es del OS se sigue escribiendo: la pestaña no se congela')
})

test('el pedido recortado sale por values:batchUpdate, y sus rangos no mencionan la celda respetada', async () => {
  sembrarHuellas()
  const { cliente, llamadas } = armar()
  await cliente.updateSheetValues('FILE', RANGO, GENERADO.map((f) => [...f]))
  const batch = llamadas.find((l) => /values:batchUpdate/.test(l.url))
  assert.ok(batch, 'con el pedido partido hay que usar values:batchUpdate: un PUT sólo escribe un rango')
  const rangos = batch.cuerpo.data.map((d) => d.range)
  assert.equal(rangos.some((r) => /D11/.test(r) && !/:/.test(r)), false)
  // La fila 11 tiene que salir partida (A11:C11), nunca entera hasta D.
  assert.ok(rangos.some((r) => /A11:C11/.test(r)), `los rangos fueron: ${rangos.join(' · ')}`)
})

test('sin nada que recortar, sigue siendo UN PUT al rango original: el camino feliz no cambia', async () => {
  sembrarHuellas()
  base.huellas.push({ fila: 11, col: 3, forma: formaDe('LLAMAR A JUAN'), huella: huellaDe('LLAMAR A JUAN'), valor: 'LLAMAR A JUAN', borrada_en: null, abandonada_en: null })
  const { cliente, llamadas } = armar()
  await cliente.updateSheetValues('FILE', RANGO, GENERADO.map((f) => [...f]))
  const puts = llamadas.filter((l) => l.metodo === 'PUT')
  assert.equal(puts.length, 1)
  assert.equal(puts[0].cuerpo.range, RANGO)
  assert.equal(llamadas.some((l) => /values:batchUpdate/.test(l.url)), false)
})

test('SE SELLA LO ESCRITO, NO LO PEDIDO: la celda respetada no se reclama como propia', async () => {
  // El otro medio defecto de B1: si se sellara la grilla entera, la celda del dueño quedaría con
  // huella mía y la corrida siguiente creería que la escribí yo. Y al revés: si no se sellara nada,
  // todo lo escrito quedaría sin huella y se auto-congelaría por la regla (e).
  sembrarHuellas()
  sellos.length = 0
  const { cliente } = armar()
  await cliente.updateSheetValues('FILE', RANGO, GENERADO.map((f) => [...f]))
  // El upsert por tandas manda [fileId, pestana, sello, (fila, col, forma, huella, valor)…].
  const sellados = sellos.filter((x) => /do update set forma/.test(x.sql)).flatMap(({ params: p }) => {
    const out = []
    for (let i = 3; i + 4 < p.length; i += 5) out.push({ fila: p[i], col: p[i + 1], valor: p[i + 4] })
    return out
  })
  assert.ok(sellados.length, 'no se selló ni una huella: todo lo escrito se auto-congelaría mañana')
  assert.equal(sellados.some((x) => x.fila === 11 && x.col === 3), false,
    'se selló como propia la celda que el dueño escribió')
  assert.ok(sellados.some((x) => x.fila === 11 && x.col === 0), 'lo que sí se escribió tiene que quedar sellado')
})
