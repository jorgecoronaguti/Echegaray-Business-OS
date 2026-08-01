#!/usr/bin/env node
// DEVUELVE A UNA PESTAÑA EL FORMATO QUE HABÍA ESTABLECIDO EL DUEÑO, SACADO DEL HISTORIAL DE DRIVE.
//
// ═══ POR QUÉ (01/08) ═══
//
// El dueño: *"continuá trabajando hasta que dejes todo CAJA con el formato que yo había establecido.
// Te dije que revisaras el historial. Podés modificar celdas y todo, pero el formato es algo que me
// debés respetar como regla de oro"*.
//
// CAJA estuvo candada varios días, así que el generador nunca la rehizo; cuando se levantó el
// candado la rehízo entera y le puso SU formato encima del que había armado él. La firma de formato
// sabe DETECTAR que un formato es del dueño, pero guarda un hash: no sirve para volver. Drive sí
// guarda el archivo completo, y una revisión exportada a .xlsx trae el formato entero.
//
// ═══ SE EMPAREJA POR RÓTULO, NUNCA POR NÚMERO DE FILA ═══
//
// Entre su última revisión y hoy la pestaña se movió: "Caja en pesos" pasó de la fila 6 a la 10 y el
// bloque del arqueo de la 141 a la 151. Aplicar su formato por posición le pondría a cada fila el
// formato de otra — el mismo defecto que ya rompió cuatro cosas en este archivo. Se empareja por el
// texto de la columna A, en orden, y lo que no matchea se informa en vez de adivinarse.
//
// ═══ SÓLO SE TOCA LO QUE SE PUDO LEER ═══
//
// El batch declara `fields` acotado a las seis propiedades que el extractor sabe recuperar: formato
// de número, fuente, relleno, alineación y ajuste de texto. Los bordes y todo lo demás quedan como
// están. Pisar el formato ENTERO con lo que uno pudo leer es la forma elegante de perder lo que no
// se leyó.
//
//   node orquestador/scripts/restaurar-formato-caja.mjs                    (mira y no toca)
//   node orquestador/scripts/restaurar-formato-caja.mjs --aplicar
//   … --revision 25454 --pestana CAJA

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { emparejarPorRotulo } from '../lib/formato-por-rotulo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const PESTAÑA = arg('pestana', 'CAJA')
const APLICAR = process.argv.includes('--aplicar')

// Las propiedades que el extractor sabe leer del xlsx. Lo que no está acá NO se toca.
const CAMPOS = 'userEnteredFormat(numberFormat,textFormat,backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy)'

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── LA REVISIÓN: la última que tocó una PERSONA, no el OS ──
  const revs = await google.listarRevisiones(ID)
  const humanas = revs.filter((r) => !/gserviceaccount\.com$/.test(r.lastModifyingUser?.emailAddress ?? ''))
  const elegida = arg('revision') ?? humanas[humanas.length - 1]?.id
  if (!elegida) throw new Error('no hay ninguna revisión hecha por una persona en el historial que Drive conserva')
  const meta = revs.find((r) => r.id === String(elegida))
  console.log(`revisión ${elegida} · ${meta?.modifiedTime} · ${meta?.lastModifyingUser?.emailAddress}`)
  console.log(`(el historial conserva ${revs.length}: ${humanas.length} de personas)\n`)

  const xlsx = `/tmp/${PESTAÑA.replace(/\W/g, '_')}-rev${elegida}.xlsx`
  writeFileSync(xlsx, await google.exportarRevision(ID, String(elegida)))
  const suyo = JSON.parse(execFileSync('python3',
    [new URL('./extraer-formato-xlsx.py', import.meta.url).pathname, xlsx, PESTAÑA], { maxBuffer: 1 << 28 }).toString())
  if (suyo.error) throw new Error(suyo.error)
  console.log(`de tu versión: ${suyo.filas.length} fila(s) con formato · ${suyo.anchos.length} ancho(s) de columna · ${suyo.congeladas} fila(s) congeladas`)

  // ── LA PESTAÑA VIVA ──
  const vivo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:A400`)
  const rotulosVivos = vivo.map((f) => String(f?.[0] ?? '').trim())
  const { pares, sinDestino, sinOrigen } = emparejarPorRotulo(suyo.filas, rotulosVivos)

  console.log(`\nemparejadas por rótulo: ${pares.length}/${suyo.filas.length}`)
  if (sinDestino.length) console.log(`  ⚠ ${sinDestino.length} fila(s) tuyas sin destino hoy (el rótulo ya no está): ${sinDestino.slice(0, 6).map((f) => `"${f.rotulo.slice(0, 28)}"`).join(' · ')}${sinDestino.length > 6 ? ' …' : ''}`)
  if (sinOrigen.length) console.log(`  ℹ ${sinOrigen.length} fila(s) nuevas de hoy que no estaban en tu versión: conservan el formato del generador`)
  const movidas = pares.filter((p) => p.filaOrigen !== p.filaDestino).length
  console.log(`  ${movidas} fila(s) cambiaron de posición: por eso se empareja por rótulo y no por número de fila`)

  if (!APLICAR) { console.log('\n(nada escrito: corré con --aplicar)'); return }

  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  const reqs = []
  for (const p of pares) {
    for (const c of p.celdas) {
      reqs.push({
        repeatCell: {
          range: { sheetId: hoja.sheetId, startRowIndex: p.filaDestino - 1, endRowIndex: p.filaDestino, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
          cell: { userEnteredFormat: c.fmt },
          fields: CAMPOS,
        },
      })
    }
  }
  for (const a of suyo.anchos) {
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: a.col, endIndex: a.col + 1 }, properties: { pixelSize: a.px }, fields: 'pixelSize' } })
  }
  if (suyo.congeladas) {
    reqs.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: suyo.congeladas } }, fields: 'gridProperties.frozenRowCount' } })
  }

  // De a tandas: un batch de miles de repeatCell da 400 por tamaño de payload.
  const TANDA = 400
  for (let i = 0; i < reqs.length; i += TANDA) {
    await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + TANDA), { yaGuardado: true })
    process.stdout.write(`  · ${Math.min(i + TANDA, reqs.length)}/${reqs.length}\r`)
  }
  console.log(`\n✓ ${reqs.length} cambio(s) de formato aplicados. Los VALORES no se tocaron.`)

  // Y se sella, para que el propio OS entienda ESTE formato como la referencia y no lo pise mañana.
  const { sellarFormato } = await import('../lib/firma-formato.mjs')
  await sellarFormato(google, ID, PESTAÑA)
  console.log('🔏 formato sellado: el OS toma el tuyo como referencia y no lo vuelve a pisar.')
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
