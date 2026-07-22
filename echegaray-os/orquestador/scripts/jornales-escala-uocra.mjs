#!/usr/bin/env node
// EL BLOQUE "ESCALA UOCRA" DE JORNALES, LEÍDO DE LA RÉPLICA Y NO PEGADO A MANO.
//
// POR QUÉ (22/07). El cuadro "ESCALA UOCRA — CCT 76/75" de la pestaña Jornales tenía los básicos
// ESCRITOS A MANO ($6.800 el Oficial Especializado, $5.817 el Oficial…) y ningún script lo escribía:
// contenido HUÉRFANO. Dos reglas de oro rotas a la vez:
//   · Regla 4 (no duplicar): la misma escala vive en _UOCRA_RAW —la réplica fiel del acuerdo, mes a
//     mes— y estaba pegada otra vez acá. Un solo juego de datos.
//   · Regla 2/6/13: un número pegado que ningún agente actualiza. El día 1 de agosto la réplica pasa
//     sola a la escala nueva (+1,9%, $7.420) y este cuadro se habría quedado en julio SIN AVISAR. Un
//     jornal por debajo del convenio es deuda laboral, no ahorro.
//
// QUÉ HACE. Reescribe SÓLO el bloque de la escala (lo ubica por su rótulo, no por fila fija) tomando
// cada básico de _UOCRA_RAW con lib/uocra-escala.mjs, que ya estaba escrito y testeado pero nunca se
// había cableado. Agrega la línea de VIGENCIA: dice qué mes de la escala se está mostrando y grita si
// el mes en curso no está cargado en la réplica. No toca las quincenas reales ni la proyección.
//
// EL "NO REMUNERATIVO MENSUAL" NO SE TOCA CON UN NÚMERO INVENTADO. El valor que estaba pegado
// ($72.900) NO aparece en ninguna columna de _UOCRA_RAW: es un dato sin origen. Regla 7 (no fabricar):
// la celda queda marcada como "falta cargarlo en la réplica" en vez de arrastrar un número que nadie
// puede verificar. Cuando el acuerdo Mayo 2026 se cargue completo en _UOCRA_RAW, se referencia igual
// que el básico.
//
//   node orquestador/scripts/jornales-escala-uocra.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { CATEGORIAS, COL, formulaValor, formulaVigencia } from '../lib/uocra-escala.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const DRY = process.argv.includes('--dry')
const ANCHO = 6 // A..F
const ROTULO = 'ESCALA UOCRA'
// La comparación es contra lo que REALMENTE pagamos por hora, que la proyección deja en $D$21/$B$21
// (Σ $/hora del plantel ÷ personas). Son celdas del bloque de proyección, que este script NO toca.
const PAGAMOS = '$D$21/$B$21'

/** Sereno se paga por MES, no por hora: no entra en la comparación horaria del resto. */
const ES_MENSUAL = (cat) => cat === 'Sereno'

function grilla(t) {
  // t = fila (1-based) del rótulo "ESCALA UOCRA". Las fórmulas de comparación referencian la fila
  // absoluta de cada categoría, no la del bloque.
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return t + filas.length - 1 }

  push(['ESCALA UOCRA — CCT 76/75, Zona A (San Juan)'])
  // La vigencia es FÓRMULA: aparece y desaparece sola según la réplica, sin esperar al agente.
  push([formulaVigencia(), 'Fuente: _UOCRA_RAW (Acuerdo Mayo 2026). Los básicos salen de ahí — no se cargan acá.'])
  push(['Categoría', 'Básico convenio', 'Jornada', 'No remunerativo', 'Δ vs lo que pagamos', '% sobre convenio'])

  for (const cat of CATEGORIAS) {
    const f = t + filas.length // fila absoluta de esta categoría
    if (ES_MENSUAL(cat)) {
      // Sereno: valor MENSUAL en la columna de básico, sin jornada ni comparación horaria.
      push([`${cat} (mensual)`, formulaValor(cat, COL.basico), '', '', '', ''])
    } else {
      push([
        cat,
        formulaValor(cat, COL.basico),
        // La jornada (8 hs) ya vive UNA vez en la proyección ($J$21, rótulo "Jornada del convenio"):
        // se referencia, no se vuelve a escribir el 8 acá — DRY, un solo lugar para la jornada.
        `=IF(N(B${f})=0;"";B${f}*$J$21)`,
        '', // no remunerativo: no está en _UOCRA_RAW, no se pega
        `=IF(N(B${f})=0;"";${PAGAMOS}-B${f})`,
        `=IF(N(B${f})=0;"";${PAGAMOS}/B${f}-1)`,
      ])
    }
  }

  push([])
  push(['⚠ "No remunerativo mensual" no está en _UOCRA_RAW: cargar el detalle del Acuerdo Mayo 2026 en la réplica para referenciarlo, en vez de pegarlo a mano.'])
  return { filas, alto: filas.length }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)

  // UBICAR EL BLOQUE POR SU RÓTULO, NUNCA POR FILA FIJA. Arriba de la escala están las quincenas
  // reales y la proyección, que crecen; una fila fija terminaría pisándolas.
  const colA = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:A120`)
  const t = colA.findIndex((f) => String(f?.[0] ?? '').trim().startsWith(ROTULO)) + 1
  if (!t) throw new Error(`no encontré el rótulo "${ROTULO}" en la columna A de ${PESTAÑA}`)

  const g = grilla(t)
  console.log(`${PESTAÑA}: bloque ESCALA UOCRA en la fila ${t} · ${g.alto} filas`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter(Boolean).map((x) => String(x).slice(0, 46)).join('  |  ')); return }

  // Limpiar una franja generosa por si el bloque viejo era más largo, después escribir.
  // NO se borra lo que escribió una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  const cp = await escribirPreservando(google, ID, `'${PESTAÑA}'`, g.filas, { fila0: t })
  if (cp.conservadas.length) console.log(`  ✋ ${cp.conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await formatear(google, hoja, t, g)

  // VERIFICAR CONTRA EL SHEET: que los básicos den número y no error, y que ninguno quede vacío (=
  // escala vencida).
  const v = await google.readSheetValues(ID, `'${PESTAÑA}'!A${t}:F${t + g.alto}`)
  const errores = v.flat().filter((c) => /#(ERROR|REF|N\/A|VALUE|NAME)/i.test(String(c ?? '')))
  const basicos = CATEGORIAS.map((cat, i) => v[3 + i]?.[1]).filter(Boolean)
  console.log(`  vigencia: ${v[1]?.[0]}`)
  console.log(`  básicos: ${basicos.join(' · ')}`)
  console.log(`  celdas en error: ${errores.length}`)
  if (errores.length) { console.log(`  ⚠ ${errores.slice(0, 3).join(' · ')}`); process.exitCode = 1 }
  if (basicos.length < CATEGORIAS.length) { console.log('  ⚠ alguna categoría quedó vacía: la escala del mes no está en _UOCRA_RAW'); process.exitCode = 1 }
}

async function formatear(google, hoja, t, g) {
  const { sheetId } = hoja
  const n = g.alto
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(t - 1, t + n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  // Básico, jornada, no-rem, Δ en moneda; % en porcentaje; A en texto.
  fmt(r(t - 1, t + n, 1, 5), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(t - 1, t + n, 5, 6), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  fmt(r(t - 1, t + n, 0, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
  // Título.
  fmt(r(t - 1, t), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 12 } })
  // Vigencia + fuente en gris chico.
  fmt(r(t, t + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { numberFormat: { type: 'TEXT' }, textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  // Cabecera de la tabla (fila t+2, índice t+1).
  fmt(r(t + 1, t + 2), 'userEnteredFormat',
    { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(t + 1, t + 2), startColumnIndex: 0, endColumnIndex: 1 }, 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'LEFT' })
  // La nota final del no-remunerativo, en ámbar-texto.
  fmt(r(t + n - 1, t + n, 0, ANCHO), 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { numberFormat: { type: 'TEXT' }, textFormat: { italic: true, fontSize: 9 }, wrapStrategy: 'WRAP' })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
