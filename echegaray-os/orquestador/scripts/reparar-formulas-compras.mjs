#!/usr/bin/env node
// EL CONTROL DE LAS FÓRMULAS DE LA PESTAÑA "Compras" — CONTRA EL SHEET VIVO.
//
// ═══ QUÉ CONTESTA ═══
//
// `contrato-columnas.mjs` congela una MEDICIÓN del 25/08/2026: doce columnas son fórmula por fila,
// diez son ARRAYFORMULA. Ese test protege el contrato de que alguien lo edite, pero no prueba nada
// sobre la pestaña de hoy — es exactamente el control validado contra la misma información que
// produce. Este script es el otro lado: abre el Sheet real y dice, celda por celda, cuáles de esas
// fórmulas siguen vivas y cuáles tienen un número pegado encima.
//
//   node orquestador/scripts/reparar-formulas-compras.mjs                  ← audita, no escribe nada
//   node orquestador/scripts/reparar-formulas-compras.mjs --detalle        ← + la lista fila por fila
//   ORQ_SHEETS_DESCONGELAR="motivo" node …/reparar-formulas-compras.mjs --reparar --si
//
// ═══ QUÉ REPARA, Y SOBRE TODO QUÉ NO ═══
//
// Restaura la fórmula ÚNICAMENTE donde restaurarla **no cambia el número** — donde el valor pegado
// es idéntico al que la fórmula devuelve (`formulas-compras.mjs` las evalúa en JS). Ahí la
// restauración es mecánica: arregla que la celda vuelva a recalcular sin mover un peso.
//
// Donde el valor pegado NO coincide, **es un dato que puso una persona** y se reporta como decisión
// del dueño. Medido el 25/08/2026: `Q` tiene número pegado en 524 filas desde la fila 4 —el
// vencimiento real del echeq, anterior al cargador— y `U` en 134 filas donde el número difiere. Un
// script que "repare" eso borra trabajo del dueño y mueve plata en el Cash Flow. No se hace solo.
//
// ═══ EL GUARD QUE IMPIDE REPARAR HACIA UNA DEFINICIÓN VIEJA ═══
//
// Antes de escribir, compara la fórmula VIVA de una fila modelo del Sheet contra el texto que la
// réplica JS declara. Si el dueño cambió la fórmula, la réplica quedó vieja y el script ABORTA: sin
// esa comparación estaría decidiendo "no-op" contra una definición que ya no rige, con total
// confianza y el número equivocado.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'
import { congelado, motivoDeLevantamiento } from '../lib/congelador-sheets.mjs'
import { CONTRATO, NATURALEZA, indiceDe, letraDe } from '../lib/comprobantes/contrato-columnas.mjs'
import { EVALUADORES, VEREDICTO, esqueletoDeFormula, veredictoDeCelda } from '../lib/comprobantes/formulas-compras.mjs'

const ID_FLUJO = process.env.ORQ_SHEET_FLUJO ?? '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const CUENTA = process.env.ORQ_GOOGLE_IMPERSONATE ?? 'jorge@ecsas.com.ar'
const RANGO = process.env.ORQ_COMPRAS_RANGO ?? 'Compras!A4:AN1000'
const PRIMERA_FILA = Number(RANGO.match(/[A-Z]+(\d+):/)?.[1] ?? 4)

const args = new Set(process.argv.slice(2))
const REPARAR = args.has('--reparar')
const CONFIRMADO = args.has('--si')
const DETALLE = args.has('--detalle')

const LETRAS_FORMULA = CONTRATO.filter((c) => c.naturaleza === NATURALEZA.FORMULA_FILA).map((c) => c.letra)
const $ = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** La fila cruda de la API como objeto por letra, para que los evaluadores lean `fila.T` y no `r[19]`. */
function filaPorLetra(fila) {
  const o = {}
  for (let i = 0; i < fila.length; i++) o[letraDe(i)] = fila[i]
  return o
}

async function leer(g, render) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${ID_FLUJO}/values:batchGet`
    + `?ranges=${encodeURIComponent(RANGO)}&valueRenderOption=${render}&majorDimension=ROWS`
  return (await g.apiGetSheets(url)).valueRanges[0].values ?? []
}

const g = makeGoogleClient({ config: loadConfig(), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const formulas = await leer(g, 'FORMULA')
const valores = await leer(g, 'UNFORMATTED_VALUE')

const iE = indiceDe('E')
const conteo = Object.fromEntries(LETRAS_FORMULA.map((l) => [l, { viva: 0, no_op: 0, humano: 0, sin_replica: 0, vacia: 0 }]))
const noOps = []       // [{letra, fila}] — lo único reparable
const humanos = []     // [{letra, fila, actual, esperado}] — decisión del dueño
let filasConDatos = 0
let modelo = null      // la última fila cuyas fórmulas están todas vivas: de ahí sale el guard

for (let i = 0; i < formulas.length; i++) {
  const rf = formulas[i] ?? []
  const rv = valores[i] ?? []
  const fila = PRIMERA_FILA + i
  if (!String(rf[iE] ?? '').trim()) continue
  filasConDatos++
  const porLetra = filaPorLetra(rv)

  if (LETRAS_FORMULA.every((l) => String(rf[indiceDe(l)] ?? '').startsWith('='))) {
    modelo = { fila, formulas: Object.fromEntries(LETRAS_FORMULA.map((l) => [l, String(rf[indiceDe(l)])])) }
  }

  for (const letra of LETRAS_FORMULA) {
    const v = veredictoDeCelda(letra, rf[indiceDe(letra)], porLetra)
    if (v.veredicto === VEREDICTO.YA_ES_FORMULA) conteo[letra].viva++
    else if (v.veredicto === VEREDICTO.VACIA) conteo[letra].vacia++
    else if (v.veredicto === VEREDICTO.NO_OP) { conteo[letra].no_op++; noOps.push({ letra, fila }) }
    // SIN_EVALUADOR no es «dato humano»: es «no tengo con qué decidir». Contarlos juntos sería
    // publicar 1.953 decisiones pendientes donde hay 489 — el resto son celdas sobre las que este
    // control, honestamente, no dice nada.
    else if (v.veredicto === VEREDICTO.SIN_EVALUADOR) conteo[letra].sin_replica++
    else { conteo[letra].humano++; humanos.push({ letra, fila, ...v }) }
  }
}

console.log(`Pestaña Compras · ${RANGO} · ${filasConDatos} filas con proveedor\n`)
console.log('col   fórmula viva   valor = fórmula   cambia el número   sin réplica   vacía')
for (const letra of LETRAS_FORMULA) {
  const c = conteo[letra]
  console.log(
    `  ${letra.padEnd(3)} ${String(c.viva).padStart(11)} ${String(c.no_op).padStart(17)} `
    + `${String(c.humano).padStart(18)} ${String(c.sin_replica).padStart(13)} ${String(c.vacia).padStart(7)}`,
  )
}

console.log(`\nReparable sin mover un peso: ${noOps.length} celdas.`)
console.log(`Cambiaría el número (dato de una persona — no se toca solo): ${humanos.length} celdas.`)
const sinRep = LETRAS_FORMULA.reduce((a, l) => a + conteo[l].sin_replica, 0)
console.log(`Sin réplica en JS (este control no dice nada sobre ellas): ${sinRep} celdas.`)

if (DETALLE) {
  console.log('\n── las que cambiarían el número ──')
  for (const h of humanos.slice(0, 200)) {
    const a = typeof h.actual === 'number' ? $(h.actual) : `"${h.actual}"`
    const e = typeof h.esperado === 'number' ? $(h.esperado) : `"${h.esperado}"`
    console.log(`  ${h.letra}${h.fila}: hoy ${a} · la fórmula daría ${e}`)
  }
  if (humanos.length > 200) console.log(`  … y ${humanos.length - 200} más`)
}

if (!REPARAR) {
  console.log('\n(auditoría — no se escribió nada. Para reparar sólo las no-op: --reparar --si)')
  process.exit(0)
}

// ─── de acá para abajo se escribe ───

if (!modelo) {
  console.error('\n✖ No hay ninguna fila con TODAS sus fórmulas vivas: sin fila modelo no se copia nada.')
  process.exit(1)
}
const desincronizadas = Object.entries(EVALUADORES)
  .filter(([l]) => modelo.formulas[l])
  .filter(([l, ev]) => esqueletoDeFormula(modelo.formulas[l]) !== esqueletoDeFormula(ev.formula))
if (desincronizadas.length) {
  console.error(`\n✖ La fórmula viva de la fila ${modelo.fila} no es la que la réplica declara:`)
  for (const [l, ev] of desincronizadas) console.error(`   ${l}: Sheet «${modelo.formulas[l]}» · réplica «${ev.formula}»`)
  console.error('   Actualizá orquestador/lib/comprobantes/formulas-compras.mjs. No se escribió nada.')
  process.exit(1)
}
if (congelado() && !motivoDeLevantamiento()) {
  console.error('\n✖ El freno de escritura de Sheets está puesto. ORQ_SHEETS_DESCONGELAR="motivo" para esta corrida.')
  process.exit(1)
}
if (!CONFIRMADO) {
  console.error(`\n✖ Faltó --si. Escribiría ${noOps.length} celdas (ninguna cambia un número).`)
  process.exit(1)
}
if (!noOps.length) { console.log('\nNada para reparar.'); process.exit(0) }

const gw = makeGoogleClient({ auth: { getAccessToken: () => accessTokenFor(CUENTA) } })
const meta = await gw.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${ID_FLUJO}?fields=sheets.properties`)
const hoja = meta.sheets.find((s) => s.properties.title === 'Compras')?.properties
if (!hoja) { console.error('✖ No existe la pestaña Compras'); process.exit(1) }

// Una copia PASTE_FORMULA por celda desde la fila modelo: la referencia relativa se reajusta sola.
const requests = noOps.map(({ letra, fila }) => {
  const col = indiceDe(letra)
  return {
    copyPaste: {
      source: { sheetId: hoja.sheetId, startRowIndex: modelo.fila - 1, endRowIndex: modelo.fila, startColumnIndex: col, endColumnIndex: col + 1 },
      destination: { sheetId: hoja.sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: col, endColumnIndex: col + 1 },
      pasteType: 'PASTE_FORMULA',
    },
  }
})
console.log(`\nCopiando la fórmula desde la fila modelo ${modelo.fila} a ${requests.length} celdas…`)
for (let i = 0; i < requests.length; i += 200) {
  await gw.apiPostSheets(
    `https://sheets.googleapis.com/v4/spreadsheets/${ID_FLUJO}:batchUpdate`,
    { requests: requests.slice(i, i + 200) },
  )
  console.log(`  ${Math.min(i + 200, requests.length)}/${requests.length}`)
}

// EL EFECTO SE LEE EN EL DESTINO, NO EN LA RESPUESTA DEL batchUpdate.
const despuesF = await leer(g, 'FORMULA')
const despuesV = await leer(g, 'UNFORMATTED_VALUE')
let ok = 0
const rotas = []
for (const { letra, fila } of noOps) {
  const i = fila - PRIMERA_FILA
  const f = String(despuesF[i]?.[indiceDe(letra)] ?? '')
  const v = despuesV[i]?.[indiceDe(letra)]
  const antes = valores[i]?.[indiceDe(letra)]
  if (!f.startsWith('=')) rotas.push(`${letra}${fila}: no quedó fórmula`)
  else if (String(v).startsWith('#')) rotas.push(`${letra}${fila}: ${v}`)
  else if (typeof antes === 'number' && typeof v === 'number' && Math.abs(antes - v) >= 0.005) {
    rotas.push(`${letra}${fila}: el número CAMBIÓ de ${$(antes)} a ${$(v)}`)
  } else ok++
}
console.log(`\n✔ ${ok}/${noOps.length} celdas verificadas en el destino: fórmula viva, sin #ERROR y con el mismo número.`)
if (rotas.length) { console.error(`✖ ${rotas.length} con problema:`); rotas.slice(0, 30).forEach((r) => console.error('   ' + r)); process.exit(1) }
