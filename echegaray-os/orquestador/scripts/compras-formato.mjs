#!/usr/bin/env node
// AUDITA —y con `--aplicar`, REPONE— el formato de la pestaña `Compras`. NUNCA toca un valor.
//
// `Compras` es donde el dueño tipea todos los días: un valor cambiado ahí es plata del negocio. La
// garantía de que este script no puede cambiar uno es ESTRUCTURAL, no una promesa: todo lo que emite
// es `repeatCell` con la máscara `FIELDS` de `compras-especies.mjs`, que nombra sólo
// `userEnteredFormat.*`. `clasificar-request.mjs` los clasifica INOCUO por esa máscara y el test de
// `compras-especies.test.mjs` lo verifica request por request.
//
// Las dos guardas del repo se aplican solas por pasar por `spreadsheetBatchUpdate`: el freno de mano
// (`congelador-sheets.mjs`) y el candado de pestaña. No hay bypass y no se pide ninguno.
//
//   node orquestador/scripts/compras-formato.mjs             # audita y no escribe nada
//   node orquestador/scripts/compras-formato.mjs --aplicar   # repone el formato

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  celdasSinNumberFormat, encabezadosSinEspecie, especiesDeEncabezado, requestsDeFormatoCompras, FILA0,
} from '../lib/compras-especies.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Compras'

/** Agrupa los huecos por columna para que el informe se lea, no para que se scrollee. */
function porColumna(huecos) {
  const m = new Map()
  for (const h of huecos) {
    const o = m.get(h.letra) ?? { letra: h.letra, especie: h.especie, n: 0, primera: h.fila, ultima: h.fila }
    o.n++; o.ultima = h.fila
    m.set(h.letra, o)
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

function informar(titulo, huecos) {
  console.log(`\n${titulo}: ${huecos.length} celda(s) de importe o fecha sin numberFormat`)
  for (const c of porColumna(huecos)) {
    console.log(`  ${c.letra.padEnd(3)} ${c.especie.padEnd(8)} ${String(c.n).padStart(5)}  de ${c.letra}${c.primera} a ${c.letra}${c.ultima}`)
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: APLICAR ? WRITE_SCOPES : undefined })
  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTANA}`)

  const encabezado = (await google.readSheetValues(ID, `${PESTANA}!A3:BZ3`))[0] || []
  // FALLA CERRADO. Una columna con nombre y sin especie no se adivina: se nombra y se para. Un
  // default silencioso es cómo se dibuja una adivinanza como si fuera un dato.
  const sinDeclarar = encabezadosSinEspecie(encabezado)
  if (sinDeclarar.length) {
    console.error(`\n✖ ${sinDeclarar.length} columna(s) de ${PESTANA} sin especie declarada. No formateo nada.`)
    for (const s of sinDeclarar) console.error(`   ${s.letra}3 · "${s.rotulo}"`)
    console.error('\n   Declaralas en ESPECIE_POR_ENCABEZADO (orquestador/lib/compras-especies.mjs).')
    process.exit(1)
  }
  const especies = especiesDeEncabezado(encabezado)
  console.log(`${PESTANA}: ${hoja.rows} filas × ${encabezado.length} columnas declaradas · datos desde la fila ${FILA0}`)

  const rango = `${PESTANA}!A1:BZ${hoja.rows}`
  const antes = await google.readSheetUserFormats(ID, rango)
  const huecos = celdasSinNumberFormat(especies, antes.filas)
  informar('ANTES', huecos)

  if (!APLICAR) {
    console.log('\n(sin --aplicar: no escribí nada)')
    return
  }

  const req = requestsDeFormatoCompras(hoja.sheetId, especies, { hastaFila: hoja.rows })
  console.log(`\n${req.length} request(s) de formato — ninguno nombra userEnteredValue.`)
  const r = await google.spreadsheetBatchUpdate(ID, req)
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // LA EVIDENCIA ES DEL EFECTO, NO DEL INTENTO: se relee el archivo y se cuenta lo que quedó.
  const despues = await google.readSheetUserFormats(ID, rango)
  const quedan = celdasSinNumberFormat(especies, despues.filas)
  informar('DESPUÉS', quedan)
  if (quedan.length) {
    console.error(`\n✖ quedaron ${quedan.length} celdas sin formato: la escritura NO cerró.`)
    process.exit(1)
  }
  console.log(`\n✓ ${huecos.length} celdas reparadas · 0 valores tocados`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
