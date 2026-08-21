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
import { construir, ANCHO } from '../lib/subcontratistas/pestana.mjs'
import { pedidos } from '../lib/subcontratistas/formato.mjs'

const CUENTA = process.env.ORQ_SUBCONTRATISTAS_CUENTA || 'jorge@ecsas.com.ar'
const FLUJO = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'SUBCONTRATISTAS'
const ALTO_HISTORICO = 90
// EL ANCHO HISTÓRICO NO ES EL ANCHO DEL CUADRO, Y LA DIFERENCIA IMPORTA.
//
// El cuadro mide 6 columnas desde el rediseño minimalista. Pero la primera versión, escrita el
// 21/08/2026, medía 9: si se declaran 6, las columnas G, H e I de aquella corrida quedan vivas
// abajo del cuadro nuevo y no se distinguen del contenido bueno. Se declara 9 —lo que este
// generador ESCRIBIÓ alguna vez— para que su propia cola se limpie sola.
//
// Al revés también es un defecto, y este repo ya lo pagó: declarar más ancho del que se escribió
// rellena con centinelas columnas ajenas y borra lo que el dueño anotó al costado. 9 es exacto.
const ANCHO_HISTORICO = 9

async function main() {
  const seco = process.argv.includes('--dry')
  const d = construir()
  const { filas } = d
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

  await batch(pedidos(hoja.sheetId, d, ANCHO))
  console.log('✓ formato aplicado — sin cuadrícula, código de color de banca, una línea por total')
  console.log(`\nhttps://docs.google.com/spreadsheets/d/${FLUJO}/edit#gid=${hoja.sheetId}`)
}

main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
