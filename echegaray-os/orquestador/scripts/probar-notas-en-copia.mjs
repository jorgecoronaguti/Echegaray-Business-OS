#!/usr/bin/env node
// PRUEBA DE PUNTA A PUNTA DE «QUÉ HACER» CONTRA UNA COPIA DEL FLUJO DE CAJA — el real no se toca.
//
// Copia el archivo en Drive, y sobre la COPIA: (1) el worker aplica un pedido de la app y se relee la C
// de _PROVEEDORES_OS y la D de Proveedores; (2) la sonda arma su lectura anterior; (3) se simula al dueño
// escribiendo una nota y vaciando otra, y la sonda las trae; (4) el worker rechaza un pedido que pisaría
// el texto a mano; (5) se prueba la guarda central sin confirmación nominal. La base es EN MEMORIA: no
// se escribe `proveedor_notas` real. La copia va a la papelera al final, pase lo que pase.
//
// Medido el 17/09/2026: la `version` de Drive tardó 12, 85 y 56 s en subir tras una escritura por API.
// Por eso la sonda se repite hasta 4 minutos esperando el cambio.
//
//   node orquestador/scripts/probar-notas-en-copia.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { closePool } from '../lib/db.mjs'
import { aplicarNota } from '../comunicacion/compras/cola-nota.mjs'
import { vueltaDeSonda } from '../lib/sonda-flujo-caja.mjs'
import { rescatarNotas } from '../lib/proveedores-notas-rescate.mjs'
import { anteriorAJson, anteriorDeJson } from '../lib/proveedores-notas-hoja.mjs'

const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const log = (...a) => console.log(...a)

/** Base en memoria: notas por clave, cierres de la cola, perfiles. Nada toca Postgres real salvo la guarda central. */
function baseMemoria(inicial) {
  const notas = new Map(inicial)
  const cierres = []
  const query = async (sql, p = []) => {
    if (sql.includes('from public.perfiles')) return { rows: [{ nombre: 'Prueba OS (copia)' }] }
    if (sql.includes('select nota from public.proveedor_notas')) return { rows: notas.has(p[0]) ? [{ nota: notas.get(p[0]).nota }] : [] }
    if (sql.includes('select proveedor, clave, nota, escrita_en')) return { rows: [...notas].map(([clave, v]) => ({ clave, proveedor: v.proveedor, nota: v.nota, escrita_en: null })) }
    if (sql.includes('insert into public.proveedor_notas')) { notas.set(p[2], { proveedor: p[1], nota: p[3] }); return { rows: [] } }
    if (sql.includes('delete from public.proveedor_notas')) { for (const c of p[1]) notas.delete(c); return { rows: [] } }
    if (sql.includes('to_regclass')) return { rows: [{ hay: false }] }
    if (sql.includes('update public.proveedor_nota_cambio')) { cierres.push(p); return { rows: [] } }
    throw new Error('sql no previsto: ' + sql.slice(0, 50))
  }
  return { notas, cierres, query }
}

let copia
try {
  copia = await g.copyFile(CASHFLOW_ID, 'PRUEBA OS notas Que hacer — BORRAR (17-09-2026)')
  log('COPIA', copia.id, copia.name)
  const ID = copia.id
  if (ID === CASHFLOW_ID) throw new Error('la copia tiene el ID del real: aborto')
  // Una copia recién creada tarda en responder lecturas de valores: sin esta espera la primera lectura vence.
  await new Promise((r) => setTimeout(r, 20000))
  const leerD = async () => (await g.readSheetValues(ID, 'Proveedores!A18:D25')).map((f) => [f[0], f[3] ?? ''])
  const leerAux = async (filtro) => (await g.readSheetValues(ID, "'_PROVEEDORES_OS'!A1:C600")).map((f, i) => [i + 1, f[0], f[2] ?? '']).filter(([, n]) => filtro.test(String(n)))
  log('D antes', JSON.stringify(await leerD()))
  log('AUX Robles antes', JSON.stringify(await leerAux(/robles/i)))

  // 1 · WORKER: la app pide cambiar la nota de Robles Pintureria.
  const db = baseMemoria([['robles pintureria', { proveedor: 'Robles Pintureria', nota: 'Contactar. cheque a 30 de factura' }]])
  const pedido = { id: 'prueba-1', clave: 'robles pintureria', proveedor: 'Robles Pintureria', nota_anterior: 'Contactar. cheque a 30 de factura', nota_nueva: 'PRUEBA OS: pagar el viernes', pedido_por: 'x', intentos: 1 }
  const r1 = await aplicarNota({ port: db, google: g, fileId: ID, pedido })
  log('WORKER aplicar →', r1, JSON.stringify(db.cierres.at(-1)))
  log('AUX Robles después', JSON.stringify(await leerAux(/robles/i)))
  log('D después', JSON.stringify(await leerD()))
  log('BASE en memoria', db.notas.get('robles pintureria')?.nota)

  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  const dbS = baseMemoria([
    ['hormiserv', { proveedor: 'Hormiserv', nota: (await leerD()).find(([n]) => /hormiserv/i.test(n))[1] }],
    ['robles pintureria', { proveedor: 'Robles Pintureria', nota: 'Contactar. cheque a 30 de factura' }],
  ])
  let estado = null
  const deps = {
    leerVersion: () => g.getVersion(ID), leerEstado: async () => estado, guardarEstado: async (e) => { estado = e },
    syncCorriendo: async () => false, pipelineCorriendo: async () => false, sincronizarCompras: async () => {},
    sincronizarNotas: async (ant) => { const r = await rescatarNotas({ google: g, fileId: ID, query: dbS.query, anterior: anteriorDeJson(ant) }); return { notas: anteriorAJson(r.siguiente), linea: 'guardar=' + JSON.stringify(r.guardar) + ' borrar=' + JSON.stringify(r.borrar) } },
    log,
  }
  await espera(15000); await vueltaDeSonda(deps)
  const filas = await leerD()
  const fH = 18 + filas.findIndex(([n]) => /hormiserv/i.test(n)); const fR = 18 + filas.findIndex(([n]) => /robles/i.test(n))
  await g.batchUpdateValues(ID, [{ range: 'Proveedores!D' + fH, values: [['PRUEBA OS: lo escribió el dueño']] }], { confirmacion: { actor: 'Prueba OS (copia)', motivo: 'simular edición a mano en la copia' } })
  // Vaciar a mano: la guarda no-borrar del cliente no deja escribir '' por valores; el dueño en el navegador sí.
  const hoja = (await g.getSheetMeta(ID)).find((x) => x.title === 'Proveedores')
  await g.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId: hoja.sheetId, startRowIndex: fR - 1, endRowIndex: fR, startColumnIndex: 3, endColumnIndex: 4 }, rows: [{ values: [{ userEnteredValue: null }] }], fields: 'userEnteredValue' } }], { espejo: true })
  log('D' + fH, JSON.stringify((await g.readSheetValues(ID, 'Proveedores!D' + fH, { render: 'FORMULA' }))?.[0]), '· D' + fR, JSON.stringify((await g.readSheetValues(ID, 'Proveedores!D' + fR, { render: 'FORMULA' }))?.[0] ?? []))
  const t0 = Date.now()
  for (let i = 0; i < 16; i++) { await espera(15000); const d = await vueltaDeSonda(deps); if (d.accion !== 'nada') { log('la sonda vio el cambio a los', Math.round((Date.now() - t0) / 1000), 's'); break } }
  log('BASE Hormiserv', JSON.stringify(dbS.notas.get('hormiserv')), '· Robles', JSON.stringify(dbS.notas.get('robles pintureria') ?? '(borrada)'))
  // 4 · WORKER con conflicto: la app pide sobre Hormiserv con lo viejo; el Sheet tiene el texto a mano → rechazo, sin escribir.
  const db2 = baseMemoria([['hormiserv', { proveedor: 'Hormiserv', nota: 'lo que la app vio' }]])
  const fH2 = 18 + (await leerD()).findIndex(([n]) => /hormiserv/i.test(n))
  const celdaH = 'Proveedores!D' + fH2
  const r2 = await aplicarNota({ port: db2, google: g, fileId: ID, pedido: { ...pedido, id: 'prueba-2', clave: 'hormiserv', proveedor: 'Hormiserv', nota_anterior: 'lo que la app vio', nota_nueva: 'PISARÍA' } })
  log('WORKER conflicto →', r2, JSON.stringify(db2.cierres.at(-1)))
  log('D Hormiserv sigue', JSON.stringify((await g.readSheetValues(ID, celdaH))?.[0]))

  // 5 · GUARDA CENTRAL: escribir sin confirmación nominal y sin espejo.
  const sinConf = await g.batchUpdateValues(ID, [{ range: "'_PROVEEDORES_OS'!C2", values: [['PRUEBA sin confirmacion']] }], {})
  log('GUARDA sin confirmación →', JSON.stringify(sinConf).slice(0, 300))
} catch (e) {
  log('FALLÓ', e.stack?.slice(0, 600)); process.exitCode = 1
} finally {
  if (copia?.id && copia.id !== CASHFLOW_ID) { const t = await g.trashFile(copia.id).catch((e) => ({ error: e.message })); log('COPIA a la papelera', JSON.stringify(t)) }
  await closePool().catch(() => {})
}
