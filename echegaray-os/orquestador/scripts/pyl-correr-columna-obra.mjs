#!/usr/bin/env node
// CORRE UNA COLUMNA LAS FÓRMULAS DEL P&L QUE LEEN COMPRAS — el otro archivo que la inserción rompe.
//
// ═══ POR QUÉ (15/09/2026) ═══
//
// Insertar «Obra» en Compras L (Flujo de Caja) no toca «Ingresos y Egresos - P&L»: su `CF_GAS` importa
// `"Compras!A:Y"` como texto y `05_Dashboard_P&L` suma `CF_GAS!$M` y `$O` por letra. Sin esto el P&L
// suma Concepto e IVA donde decía Importe y Total. La transformación, pura y probada, vive en
// `lib/pyl-columna-obra.mjs`; acá sólo se lee, se muestra, se escribe y se relee.
//
// ═══ EL ORDEN ═══
//
//   1. se leen TODAS las fórmulas del archivo (render FORMULA, en su locale: `;`) y se guardan a disco;
//   2. se arma el plan: cada celda antes → después y las columnas que usa. Si hay una duda, el import
//      ya no dice A:Y, o no aparece el import, NO se sigue;
//   3. (--aplicar) `updateCells` con `formulaValue` —en el locale del archivo, sin convertir: la fórmula
//      viene leída así y convertirla otra vez rompería un decimal—, sólo esas celdas;
//   4. se relee el archivo y cada celda tiene que decir exactamente lo planeado.
//
// Sin --aplicar se usan scopes de SOLO LECTURA: no puede escribir aunque quisiera.
// CF_COB (la copia de Cobranzas) está en #REF! desde antes de la inserción: se cuenta y no se toca.
//
//   node orquestador/scripts/pyl-correr-columna-obra.mjs              # dry, READONLY
//   node orquestador/scripts/pyl-correr-columna-obra.mjs --aplicar    # desde el árbol principal, con el dueño,
//                                                                     # DESPUÉS de insertar la columna en Compras

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { letra } from '../lib/compras-columnas.mjs'
import { PYL_ID, planDelPyl } from '../lib/pyl-columna-obra.mjs'

const clave = (hoja, celda) => `${hoja}!${celda}`

/** `M12` → índices 0-based. */
export function coordenadas(celda) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(celda))
  if (!m) throw new Error(`celda inválida: ${celda}`)
  return { fila: Number(m[2]) - 1, col: [...m[1]].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1 }
}

/** Todas las fórmulas del archivo, pestaña por pestaña. */
export async function leerFormulas(google, id = PYL_ID) {
  const out = []
  for (const s of await google.getSheetMeta(id)) {
    if (!s.rows || !s.cols) continue
    const rango = `'${String(s.title).replace(/'/g, "''")}'!A1:${letra(s.cols - 1)}${s.rows}`
    const grilla = await google.readSheetValues(id, rango, { render: 'FORMULA' })
    ;(grilla ?? []).forEach((fila, i) => (fila ?? []).forEach((c, j) => {
      if (typeof c === 'string' && c.startsWith('=')) out.push({ hoja: s.title, sheetId: s.sheetId, celda: `${letra(j)}${i + 1}`, formula: c })
    }))
  }
  return out
}

/** Los `updateCells` de un plan: una celda por request, sólo `userEnteredValue`. NÚCLEO PURO. */
export function requestsDelPlan(cambios = []) {
  return cambios.map((c) => {
    if (!Number.isInteger(c.sheetId)) throw new Error(`${clave(c.hoja, c.celda)} sin sheetId: no escribo a ciegas`)
    const { fila, col } = coordenadas(c.celda)
    return {
      updateCells: {
        range: { sheetId: c.sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rows: [{ values: [{ userEnteredValue: { formulaValue: c.despues } }] }],
        fields: 'userEnteredValue',
      },
    }
  })
}

/** Lo planeado contra lo releído. NÚCLEO PURO. */
export function diferenciasDeRelectura(cambios = [], releidas = []) {
  const vivo = new Map(releidas.map((f) => [clave(f.hoja, f.celda), f.formula]))
  return cambios
    .filter((c) => vivo.get(clave(c.hoja, c.celda)) !== c.despues)
    .map((c) => `${clave(c.hoja, c.celda)}: quedó «${String(vivo.get(clave(c.hoja, c.celda)) ?? '(vacía)').slice(0, 80)}»`)
}

function mostrar(plan, log) {
  log(`P&L: ${plan.cambios.length} fórmula(s) cambiarían · ${plan.citanCob} citan CF_COB (#REF! desde antes: no se tocan)`)
  for (const c of plan.cambios) {
    log(`  ${clave(c.hoja, c.celda)}  columnas ${c.columnas.antes.join(',') || '—'} → ${c.columnas.despues.join(',') || '—'}`)
    log(`    antes:   ${c.antes}`)
    log(`    después: ${c.despues}`)
    for (const a of c.avisos) log(`    ⚠ ${a}`)
  }
}

/**
 * La corrida. Todo lo externo entra por parámetro.
 * @returns {Promise<{ok:boolean, paso:string, detalle?:string[], plan?:object}>}
 */
export async function correrPyl({ google, aplicar = false, guardar, log = console.log, id = PYL_ID }) {
  const formulas = await leerFormulas(google, id)
  log(`P&L: ${formulas.length} fórmulas leídas · foto en ${guardar('pyl-formulas-antes', formulas)}`)
  const sheetIds = new Map(formulas.map((f) => [clave(f.hoja, f.celda), f.sheetId]))
  const plan = planDelPyl(formulas)
  plan.cambios = plan.cambios.map((c) => ({ ...c, sheetId: sheetIds.get(clave(c.hoja, c.celda)) }))
  mostrar(plan, log)
  log(`P&L: plan en ${guardar('pyl-plan', plan)}`)
  if (plan.problemas.length) {
    log(`✖ P&L — no corro nada:\n  ${plan.problemas.join('\n  ')}`)
    return { ok: false, paso: 'plan', detalle: plan.problemas, plan }
  }
  if (!aplicar) { log('(dry) P&L: no llamé a ninguna API de escritura'); return { ok: true, paso: 'dry', plan } }

  const res = await google.spreadsheetBatchUpdate(id, requestsDelPlan(plan.cambios))
  if (res?.protegido || res?.congelado || res?.frenados?.length) {
    log(`✖ P&L: la escritura no pasó: ${JSON.stringify(res).slice(0, 200)}`)
    return { ok: false, paso: 'escritura', plan }
  }
  const mal = diferenciasDeRelectura(plan.cambios, await leerFormulas(google, id))
  if (mal.length) {
    log(`✖ P&L: ${mal.length} celda(s) no quedaron como se planeó:\n  ${mal.slice(0, 20).join('\n  ')}`)
    return { ok: false, paso: 'relectura', detalle: mal, plan }
  }
  log(`✓ P&L: ${plan.cambios.length} celda(s) releídas con la fórmula corrida`)
  return { ok: true, paso: 'fin', plan }
}

/** El guardado a disco que usan este script y `sheet-insertar-columna-obra`. */
export function guardarEnRespaldos(prefijo = 'obra') {
  const dir = join(process.env.HOME ?? '.', '.echegaray', 'respaldos')
  mkdirSync(dir, { recursive: true })
  const sello = new Date().toISOString().replace(/[:.]/g, '-')
  return (nombre, datos) => { const f = join(dir, `${prefijo}-${nombre}-${sello}.json`); writeFileSync(f, JSON.stringify(datos, null, 1)); return f }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const { makeGoogleClient, WRITE_SCOPES, READONLY_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })
  const r = await correrPyl({ google, aplicar, guardar: guardarEnRespaldos('pyl') })
  if (!r.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
