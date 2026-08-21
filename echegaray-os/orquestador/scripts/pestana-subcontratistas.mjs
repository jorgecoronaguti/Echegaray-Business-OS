#!/usr/bin/env node
// LA PESTAÑA «SUBCONTRATISTAS» DEL FLUJO DE CAJA.
//
//   node orquestador/scripts/pestana-subcontratistas.mjs [--dry]
//
// ═══ QUÉ ESCRIBE Y QUÉ NO ═══
//
// Escribe UNA pestaña. No toca «Compras» —es la fuente y no se edita— ni ninguna otra.
//
// ═══ LO QUE EL DUEÑO ESCRIBA ACÁ ES SUYO (REGLA 0) ═══
//
// Va por `escribirPreservando` con `respetar` en su valor por defecto. No es una formalidad: esta
// pestaña es exactamente el tipo de cuadro al que alguien le agrega una columna al costado —«¿le
// seguimos dando trabajo?», «pidió aumento», un teléfono— y un generador que corre después y la
// pisa es el defecto que este repositorio ya pagó seis veces.
//
// `anchoHoja` es 9 y no el ancho de la hoja: el generador es dueño de SUS nueve columnas y de nada
// más. Declarar el ancho de la hoja rellenaría con centinelas columnas que nunca escribió, y eso ya
// borró catorce fechas del dueño en otra pestaña.
//
// La cola va por el MODO A de `cola-de-rango`: el alto lo decide el padrón, que es código. Si la
// lista se achica, las filas de la corrida anterior se limpian solas con el centinela; si crece más
// que ALTO_HISTORICO, la corrida ABORTA en vez de dejar cola publicada en silencio.
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { getTokenFor, accessTokenFor, OAUTH_SCOPES } from '../lib/google-oauth.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaLimpiable } from '../lib/cola-de-rango.mjs'
import { construir } from '../lib/subcontratistas/pestana.mjs'

const CUENTA = process.env.ORQ_SUBCONTRATISTAS_CUENTA || 'jorge@ecsas.com.ar'
const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'SUBCONTRATISTAS'
const ANCHO_HISTORICO = 9
const ALTO_HISTORICO = 90

async function main() {
  const seco = process.argv.includes('--dry')
  const { filas, fechas, monedas, porcentajes } = construir()
  if (seco) {
    console.log(`${PESTANA}: ${filas.length} filas`)
    for (const [i, f] of filas.entries()) {
      const s = f.map((c) => String(c ?? '')).join(' | ')
      if (s.trim()) console.log(String(i + 1).padStart(3), s.slice(0, 190))
    }
    return
  }

  const google = makeGoogleClient({
    config: loadConfig(), scopes: OAUTH_SCOPES, getToken: getTokenFor(CUENTA), soloUsuario: true,
  })
  const meta = await google.getSheetMeta(FLUJO)
  let hoja = meta.find((h) => h.title === PESTANA)
  const tok = await accessTokenFor(CUENTA)
  const batch = async (requests) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${FLUJO}:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    if (!r.ok) throw new Error(`batchUpdate ${r.status}: ${String(await r.text()).slice(0, 250)}`)
    return r.json()
  }

  if (!hoja) {
    // Al final del archivo, para no correr de lugar ninguna pestaña que el dueño ya ubicó.
    const r = await batch([{ addSheet: { properties: { title: PESTANA, index: meta.length } } }])
    hoja = { sheetId: r.replies[0].addSheet.properties.sheetId, title: PESTANA }
    console.log('✓ pestaña creada:', hoja.sheetId)
  } else console.log('· la pestaña ya existía:', hoja.sheetId)

  const cuadro = conColaLimpiable(filas, { ancho: ANCHO_HISTORICO, alto: ALTO_HISTORICO, quien: PESTANA })
  const r = await escribirPreservando(google, FLUJO, `'${PESTANA}'`, cuadro, { anchoHoja: ANCHO_HISTORICO })
  console.log(`✓ ${filas.length} filas escritas · ${r.conservadas.length} celdas ajenas conservadas`
    + `${r.respetadas.length ? ` · ${r.respetadas.length} textos del dueño respetados` : ''}`)
  for (const c of r.conservadas.slice(0, 10)) console.log(`   · se conservó lo que había en fila ${c.fila}, col ${c.col}: ${String(c.valor).slice(0, 60)}`)

  const a1 = (rango) => {
    const [, c0, f0, c1, f1] = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rango)
    const col = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
    return { sheetId: hoja.sheetId, startRowIndex: +f0 - 1, endRowIndex: +f1, startColumnIndex: col(c0), endColumnIndex: col(c1) + 1 }
  }
  // El formato en patrón US aunque el archivo sea es_AR: `numberFormat` no habla locale.
  const pintar = (rangos, pattern, type) => rangos.map((r) => ({
    repeatCell: { range: a1(r), cell: { userEnteredFormat: { numberFormat: { type, pattern } } }, fields: 'userEnteredFormat.numberFormat' },
  }))
  await batch([
    ...pintar(fechas, 'dd/mm/yyyy', 'DATE'),
    ...pintar(monedas, '"$"#,##0', 'CURRENCY'),
    ...pintar(porcentajes, '0.0%', 'PERCENT'),
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } },
    { autoResizeDimensions: { dimensions: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: ANCHO_HISTORICO } } },
  ])
  console.log('✓ formato aplicado')
  console.log(`\nhttps://docs.google.com/spreadsheets/d/${FLUJO}/edit#gid=${hoja.sheetId}`)
}

main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
