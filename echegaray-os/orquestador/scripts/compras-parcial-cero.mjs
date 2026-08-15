#!/usr/bin/env node
// EL GUION TIPEADO DE `Compras!U · Monto Parcial 1` PASA A SER UN CERO DE VERDAD.
//
// ═══ QUÉ ARREGLA ═══
//
// 243 celdas de esa columna tienen el TEXTO `"$ -"` escrito a mano en una columna con formato de
// moneda. Un guion tipeado no suma, no compara, no cuenta y —lo peor— no se distingue de un cero
// legítimo cuando se lo mira. Las 243 están en filas cuyo `S · Total o Parcial` dice "Total": el pago
// fue total y el parcial es cero. El porqué de "cero y no vacío" está escrito en `compras-valores.mjs`.
//
// ═══ LAS DOS FILAS QUE NO SE TOCAN ═══
//
// La 268 y la 314 son compras a Google en DÓLARES metidas en columnas de pesos. Normalizar cualquier
// cosa ahí es opinar sobre la conversión, y eso cambia sumas: es criterio contable y lo firma el
// dueño. El script las lista con su importe y su proveedor, y sigue de largo.
//
// ═══ CÓMO NO ROMPE NADA ═══
//
// Sólo escribe sobre celdas cuyo contenido crudo ES el guion, una por una, agrupadas en tramos
// contiguos para no emitir 241 requests. Un importe real, una fórmula o una celda vacía no entran
// nunca al lote. Y la prueba de que no se movió plata es la SUMA de la columna leída del archivo
// antes y después: tiene que dar exactamente lo mismo, porque un texto y un cero suman igual.
//
//   node orquestador/scripts/compras-parcial-cero.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/compras-parcial-cero.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  COL, FILAS_EN_OTRA_MONEDA, GUION_TIPEADO, ROTULO, filasConGuion, tramosContiguos,
} from '../lib/compras-valores.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Compras'
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const idxCol = (l) => String(l).toUpperCase().split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** La suma de lo que la columna vale HOY, leída del archivo. Un texto vale cero, igual que un cero. */
const sumaNumerica = (col = []) => col.reduce((a, f) => a + (typeof f?.[0] === 'number' ? f[0] : 0), 0)

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: APLICAR ? WRITE_SCOPES : undefined })
  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTANA}: no escribo a ciegas`)

  const cab = String((await google.readSheetValues(ID, `${PESTANA}!${COL.parcial1}3`))?.[0]?.[0] ?? '').trim()
  if (cab !== ROTULO.parcial1) {
    throw new Error(`${COL.parcial1}3 dice "${cab}" y no "${ROTULO.parcial1}". No es mi columna: no la piso.`)
  }

  const rango = `${PESTANA}!${COL.parcial1}1:${COL.parcial1}${hoja.rows}`
  const crudo = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  const numerico = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
  const { normalizar, excluidas } = filasConGuion(crudo)
  const sumaAntes = sumaNumerica(numerico)
  const tramos = tramosContiguos(normalizar)

  console.log(`${PESTANA}!${COL.parcial1} · "${cab}" · ${normalizar.length} guion(es) tipeado(s) a normalizar `
    + `en ${tramos.length} tramo(s) · suma actual de la columna ${plata(sumaAntes)}`)

  if (excluidas.length) {
    const filas = await google.readSheetValues(ID, `${PESTANA}!A1:AN${hoja.rows}`, { render: 'FORMATTED_VALUE' })
    console.log(`\n⊘ ${excluidas.length} fila(s) EN OTRA MONEDA — no se tocan, las decide el dueño:`)
    for (const f of excluidas) {
      const r = filas[f - 1] || []
      console.log(`   fila ${f} · ${String(r[4] ?? '?').padEnd(14)} · comprobante ${String(r[7] ?? '?').padEnd(14)}`
        + ` · Importe ${String(r[12] ?? '?')} · IVA ${String(r[13] ?? '?')} · Total ${String(r[14] ?? '?')}`)
    }
    console.log('   Son importes reales en dólares en columnas que sólo saben de pesos. Convertirlos cambia'
      + ' las sumas de la pestaña: es criterio contable, no formato.')
  }
  if (!normalizar.length) { console.log('\nno hay nada que normalizar'); return }
  console.log(`\ntramos: ${tramos.slice(0, 8).map((t) => `${t.desde}-${t.hasta}`).join(' ')}${tramos.length > 8 ? ' …' : ''}`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }

  const col = idxCol(COL.parcial1)
  const req = tramos.map((t) => ({ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: t.desde - 1, endRowIndex: t.hasta, startColumnIndex: col, endColumnIndex: col + 1 },
    rows: Array.from({ length: t.hasta - t.desde + 1 }, () => ({ values: [{ userEnteredValue: { numberValue: 0 } }] })),
    fields: 'userEnteredValue',
  } }))
  const r = await google.spreadsheetBatchUpdate(ID, req)
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO, y son tres preguntas distintas.
  const despuesCrudo = await google.readSheetValues(ID, rango, { render: 'FORMULA' })
  const despuesNum = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
  const quedan = filasConGuion(despuesCrudo).normalizar
  const noCero = normalizar.filter((f) => despuesNum[f - 1]?.[0] !== 0)
  const sumaDespues = sumaNumerica(despuesNum)
  const sobrevivieron = FILAS_EN_OTRA_MONEDA.filter((f) => GUION_TIPEADO.test(String(despuesCrudo[f - 1]?.[0] ?? '')))

  console.log(`\nDESPUÉS  ${normalizar.length - noCero.length}/${normalizar.length} celdas en 0 · `
    + `${quedan.length} guion(es) sin normalizar · suma ${plata(sumaDespues)}`)
  let mal = false
  if (noCero.length) { console.error(`✖ ${noCero.length} celda(s) no quedaron en 0: ${noCero.slice(0, 8).join(', ')}`); mal = true }
  if (quedan.length) { console.error(`✖ quedaron ${quedan.length} guion(es) tipeado(s): la escritura no cerró`); mal = true }
  if (Math.abs(sumaDespues - sumaAntes) > 0.5) {
    console.error(`✖ la columna cambió de ${plata(sumaAntes)} a ${plata(sumaDespues)}: se movió plata y esto sólo cambiaba tipos`)
    mal = true
  } else console.log('✓ la suma de la columna no se movió un peso: cambió el TIPO, no el dato')
  if (sobrevivieron.length !== FILAS_EN_OTRA_MONEDA.length) {
    console.error(`✖ una fila en otra moneda fue tocada: quedaban ${FILAS_EN_OTRA_MONEDA.length} y hay ${sobrevivieron.length}`)
    mal = true
  } else console.log(`✓ las ${FILAS_EN_OTRA_MONEDA.length} filas en otra moneda siguen intactas`)
  if (mal) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message ?? e); process.exit(1) })
