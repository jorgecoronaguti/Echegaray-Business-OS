#!/usr/bin/env node
// INSERTA LA COLUMNA «OBRA» EN COMPRAS L Y COBRANZAS H — con la prueba del efecto antes y después.
//
// ═══ QUÉ Y POR QUÉ (dueño, 14/09/2026) ═══
//
// La obra codificada va AL LADO de la columna de obra que ya existe, no al final. Todo lo que está a
// la derecha se corre una letra. Google corrige las fórmulas del archivo; el OS lo tiene resuelto por
// rótulo (`columnas-por-encabezado.mjs`) y las huellas de la base se corren con
// `huellas-correr-columna.mjs`, que este script invoca.
//
// ═══ LOS PASOS, EN ESTE ORDEN, Y CADA UNO FRENA AL SIGUIENTE ═══
//
//   1. el encabezado actual es el esperado (K «Detalles / Obra», L «Concepto»; G «Obra / Cliente»,
//      H «ORDEN DE COMPRA») — si no, ABORTA: la columna ya se insertó o la pestaña cambió;
//   2. foto de valores y fórmulas de las dos pestañas, a archivo;
//   3. insertDimension en Compras L y Cobranzas H, y el rótulo «Obra»;
//   4. relectura y comparación celda por celda contra la foto corrida una columna: 0 diferencias;
//   5. huellas de la base corridas (--aplicar de huellas-correr-columna);
//   6. foto nueva, a archivo.
//
// Sin --aplicar llega hasta el paso 2 y dice qué haría: NO llama a ninguna API de escritura.
// Lo que NO hace: deshacer. Si el paso 4 da diferencias, frena ANTES de tocar la base y el archivo
// queda con la columna insertada: se decide mirando la foto, no con un revert automático.
//
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs              # dry
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs --aplicar    # desde el árbol principal, con el dueño

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { normalizarRotulo } from '../lib/compras-columnas.mjs'

export const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Dónde va la columna y qué rótulos la rodean hoy. `indice` es 0-based: la columna nueva. */
export const INSERCIONES = Object.freeze([
  Object.freeze({ pestana: 'Compras', filaEncabezado: 3, indice: 11, izquierda: 'Detalles / Obra', derecha: 'Concepto' }),
  Object.freeze({ pestana: 'Cobranzas', filaEncabezado: 4, indice: 7, izquierda: 'Obra / Cliente', derecha: 'ORDEN DE COMPRA' }),
])
export const ROTULO = 'Obra'

/** Paso 1, puro: los rótulos que rodean el lugar de la inserción. Devuelve los problemas. */
export function verificarEncabezado(encabezado = [], ins) {
  const mal = []
  const [izq, der] = [encabezado[ins.indice - 1], encabezado[ins.indice]]
  if (normalizarRotulo(izq) !== normalizarRotulo(ins.izquierda)) mal.push(`${ins.pestana}: esperaba «${ins.izquierda}» y dice «${izq ?? ''}»`)
  if (normalizarRotulo(der) !== normalizarRotulo(ins.derecha)) mal.push(`${ins.pestana}: esperaba «${ins.derecha}» y dice «${der ?? ''}»`)
  return mal
}

/** Una grilla con una columna vacía insertada en `indice` (lo que la foto tiene que ser después). */
export function correrUnaColumna(grilla = [], indice) {
  return grilla.map((f) => {
    const fila = [...(f ?? [])]
    if (fila.length <= indice) return fila
    return [...fila.slice(0, indice), '', ...fila.slice(indice)]
  })
}

const vacio = (v) => v === undefined || v === null || v === ''

/**
 * Paso 4, puro: la relectura contra la foto corrida. Compara VALORES: las fórmulas cambian de texto al
 * insertar (Google corre sus referencias) y su valor no. La columna nueva sólo puede tener el rótulo.
 * @returns {string[]} las diferencias, `pestaña!fila:col antes → ahora`
 */
export function diferencias(antes = [], despues = [], ins) {
  const esperado = correrUnaColumna(antes, ins.indice)
  const out = []
  const filas = Math.max(esperado.length, despues.length)
  for (let i = 0; i < filas; i++) {
    const [e, d] = [esperado[i] ?? [], despues[i] ?? []]
    for (let j = 0; j < Math.max(e.length, d.length); j++) {
      if (j === ins.indice && i === ins.filaEncabezado - 1) continue
      const [a, b] = [e[j], d[j]]
      if (vacio(a) && vacio(b)) continue
      if (a !== b) out.push(`${ins.pestana}!f${i + 1}:c${j} ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    }
  }
  return out
}

/** Los requests del paso 3. */
export function requestsDeInsercion(ins, sheetId) {
  return [
    { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: ins.indice, endIndex: ins.indice + 1 }, inheritFromBefore: true } },
    { updateCells: {
      range: { sheetId, startRowIndex: ins.filaEncabezado - 1, endRowIndex: ins.filaEncabezado, startColumnIndex: ins.indice, endColumnIndex: ins.indice + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO } }] }], fields: 'userEnteredValue' } },
  ]
}

async function foto(google, pestanas) {
  const out = {}
  for (const p of pestanas) {
    out[p] = {
      valores: await google.readSheetValues(ID, `'${p}'!A1:ZZ`, { render: 'UNFORMATTED_VALUE' }),
      formulas: await google.readSheetValues(ID, `'${p}'!A1:ZZ`, { render: 'FORMULA' }),
    }
  }
  return out
}

/**
 * La corrida entera. Todo lo externo entra por parámetro: `google`, `correrHuellas`, `guardar`.
 * @returns {Promise<{ok:boolean, paso:string, detalle?:string[]}>}
 */
export async function insertarColumnaObra({ google, aplicar = false, correrHuellas, guardar, log = console.log }) {
  const pestanas = INSERCIONES.map((i) => i.pestana)
  const meta = await google.getSheetMeta(ID)
  const hojas = Object.fromEntries(INSERCIONES.map((i) => [i.pestana, meta.find((s) => s.title === i.pestana)]))
  const mal = []
  for (const ins of INSERCIONES) {
    if (!Number.isInteger(hojas[ins.pestana]?.sheetId)) { mal.push(`no existe la pestaña ${ins.pestana}`); continue }
    const enc = (await google.readSheetValues(ID, `'${ins.pestana}'!A${ins.filaEncabezado}:BZ${ins.filaEncabezado}`))?.[0] ?? []
    mal.push(...verificarEncabezado(enc, ins))
  }
  if (mal.length) { log(`✖ encabezado inesperado — NO inserto:\n  ${mal.join('\n  ')}`); return { ok: false, paso: 'encabezado', detalle: mal } }
  log('1 ✓ encabezados como se esperaba')

  const antes = await foto(google, pestanas)
  log(`2 ✓ foto previa guardada en ${guardar('antes', antes)}`)
  for (const ins of INSERCIONES) log(`   ${ins.pestana}: insertaría «${ROTULO}» en el índice ${ins.indice} (${antes[ins.pestana].valores.length} filas)`)
  if (!aplicar) { log('(dry) no llamé a ninguna API de escritura'); return { ok: true, paso: 'dry' } }

  const req = INSERCIONES.flatMap((ins) => requestsDeInsercion(ins, hojas[ins.pestana].sheetId))
  const res = await google.spreadsheetBatchUpdate(ID, req, { yaGuardado: true })
  if (res?.protegido || res?.congelado || res?.frenados?.length) {
    log(`✖ la escritura no pasó: ${JSON.stringify(res).slice(0, 200)}`)
    return { ok: false, paso: 'insercion' }
  }
  log('3 ✓ columnas insertadas')

  const despues = await foto(google, pestanas)
  const difs = INSERCIONES.flatMap((ins) => diferencias(antes[ins.pestana].valores, despues[ins.pestana].valores, ins))
  const rotulos = INSERCIONES.filter((ins) => despues[ins.pestana].valores?.[ins.filaEncabezado - 1]?.[ins.indice] !== ROTULO)
  if (difs.length || rotulos.length) {
    log(`✖ ${difs.length} diferencia(s) y ${rotulos.length} rótulo(s) faltante(s) — NO corro las huellas:\n  ${difs.slice(0, 20).join('\n  ')}`)
    guardar('despues-con-diferencias', despues)
    return { ok: false, paso: 'comparacion', detalle: difs }
  }
  log('4 ✓ 0 diferencias celda por celda contra la foto corrida una columna')

  await correrHuellas()
  log('5 ✓ huellas corridas')
  log(`6 ✓ foto nueva guardada en ${guardar('despues', await foto(google, pestanas))}`)
  return { ok: true, paso: 'fin' }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const { makeGoogleClient, WRITE_SCOPES, READONLY_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })
  const dir = join(process.env.HOME ?? '.', '.echegaray', 'respaldos')
  mkdirSync(dir, { recursive: true })
  const sello = new Date().toISOString().replace(/[:.]/g, '-')
  const guardar = (nombre, datos) => { const f = join(dir, `obra-${nombre}-${sello}.json`); writeFileSync(f, JSON.stringify(datos)); return f }
  const correrHuellas = async () => {
    const db = await import('../lib/db.mjs')
    const { correrHuellas: correr } = await import('./huellas-correr-columna.mjs')
    try { await correr({ db, google, aplicar: true }) } finally { await db.closePool() }
  }
  const r = await insertarColumnaObra({ google, aplicar, correrHuellas, guardar })
  if (!r.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
