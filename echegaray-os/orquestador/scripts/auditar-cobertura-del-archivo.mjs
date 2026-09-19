#!/usr/bin/env node
// ¿REFLEJAN LOS CASH FLOW TODOS LOS DATOS DEL SHEET? — la regla de oro 8, medida. Sólo lee.
//
// ═══ QUÉ CONTESTA ESTE AUDITOR Y NINGÚN OTRO ═══
//
// El dueño, textual: *"los cash flows semanales y mensuales tienen q reflejar todos los datos del
// sheet"*. Los tres controles que ya existían alrededor de esa regla contestan otra pregunta:
//
//   · `auditar-cuadre-cash-flow`  → ¿dicen lo mismo las dos vistas? (su cabecera declara que NO valida
//                                   el número del que parten: las dos leen el mismo Libro)
//   · `guardaDeCobertura`         → ¿la geometría cubre todas las semanas? (cobertura TEMPORAL)
//   · `huecosDeCobertura`         → ¿cada rubro llega a diciembre? (un rubro puede llegar a diciembre
//                                   y faltarle veintiuna facturas)
//
// Este mide la cobertura del ARCHIVO, en dos preguntas que ninguno hacía:
//
//   1. ¿Toda hoja del archivo tiene un rol declarado?   → lib/cobertura-hojas.mjs
//   2. De las fuentes, ¿llega toda su plata al Libro?   → lib/cobertura-plata.mjs
//
// LOS DOS LADOS SE LEEN DE PESTAÑAS DISTINTAS y ninguno se recalcula acá: la fuente es Compras /
// Cobranzas y el destino es `_MOVIMIENTOS`. Un control no se valida contra la información que él mismo
// produce, y por eso este auditor no vuelve a computar un solo peso.
//
// LEE Y NADA MÁS, TAMBIÉN EN EL PERMISO: el token que se emite no alcanza para escribir aunque el
// código quisiera. Mismo criterio que `auditar-cuadre-cash-flow.mjs`.
//
// Salida 0 si no hay huecos, 1 si los hay.
//
//   node orquestador/scripts/auditar-cobertura-del-archivo.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { informeDeHojas, rolesDeclarados } from '../lib/cobertura-hojas.mjs'
import { MOTIVOS, huecosDePlata, porMotivo, residuoDeCobranzas, residuoDeCompras } from '../lib/cobertura-plata.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SCOPES_LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

/** Las columnas de `_MOVIMIENTOS` que este auditor usa. El orden lo escribe libro-movimientos-pestana. */
const COL = Object.freeze({ importe: 2, cuit: 10, comprobante: 11, origen: 13, fila: 14 })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: SCOPES_LECTURA })
  const hojas = (await google.getSheetMeta(ID)).map((h) => h.title)

  console.log(`EL ARCHIVO TIENE ${hojas.length} HOJAS · ${rolesDeclarados().size} rol(es) declarado(s)`)
  const problemasDeHojas = informeDeHojas(hojas)
  for (const l of problemasDeHojas) console.log(`  ${l}`)
  if (!problemasDeHojas.length) console.log('  ✓ todas las hojas tienen rol declarado y todo lo declarado existe')

  const [movimientos, compras, cobranzas] = await Promise.all([
    leerLibro(google),
    google.readSheetValues(ID, 'Compras!A1:AN', { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, 'Cobranzas!A1:BB', { render: 'UNFORMATTED_VALUE' }),
  ])
  console.log(`\nEL LIBRO TIENE ${movimientos.length} MOVIMIENTO(S)`)

  const fuentes = [
    { pestana: 'Compras', residuo: residuoDeCompras(compras, movimientos) },
    { pestana: 'Cobranzas', residuo: residuoDeCobranzas(cobranzas, movimientos) },
  ]
  let huecos = 0
  let porVenir = 0 // lo que TODAVÍA va a moverse: es lo que la proyección se pierde
  let yaMovido = 0 // lo que YA se movió: es lo que el histórico del cuadro subregistra
  for (const f of fuentes) {
    console.log(`\n${f.pestana.toUpperCase()} — ${f.residuo.length} fila(s) con importe`)
    for (const g of porMotivo(f.residuo)) console.log(`  ${linea(g)}`)
    for (const g of huecosDePlata(f.residuo)) {
      huecos += g.filas
      // NETO, no en magnitud: una nota de crédito que falta es plata que vuelve, y sumarla en
      // valor absoluto la contaría del lado del egreso — el doble de su importe, al revés.
      porVenir += g.pendiente
      yaMovido += g.importe - g.pendiente
      console.log(`  ⛔ ${g.motivo}: ${MOTIVOS[g.motivo]?.texto ?? '(motivo sin texto)'}`)
      console.log(`     filas ${g.ejemplos.map((e) => `${e.fila} (${e.proveedor || 's/nombre'} ${pesos(e.importe)})`).join(' · ')}`
        + `${g.filas > g.ejemplos.length ? ` …y ${g.filas - g.ejemplos.length} más` : ''}`)
    }
  }

  if (!problemasDeHojas.length && !huecos) {
    return console.log('\n✓ el archivo entero tiene rol declarado y toda la plata de las fuentes llega al Libro.')
  }
  // LOS DOS NÚMEROS NO SE SUMAN EN UNO, y no es prolijidad: son dos ventanas de tiempo distintas y dos
  // decisiones distintas. Lo pendiente es plata que la PROYECCIÓN no ve y que hay que pagar; lo ya
  // movido es plata que salió y el cuadro de lo REAL no muestra. Un total único los mezclaría.
  console.log(`\n⛔ ${problemasDeHojas.length} hoja(s)/declaración(es) sin resolver · ${huecos} fila(s) de plata `
    + 'fuera del Libro:')
  console.log(`   ${pesos(porVenir).padStart(16)} TODAVÍA SIN PAGAR — la proyección de caja no lo ve`)
  console.log(`   ${pesos(yaMovido).padStart(16)} YA SE MOVIÓ — el cuadro de lo real lo subregistra`)
  process.exitCode = 1
}

/** Un renglón por motivo: la foto de a dónde fue cada fila de la fuente. */
function linea(g) {
  const marca = g.hueco ? '⛔' : (g.motivo === 'EN_EL_LIBRO' ? '✓' : '·')
  return `${marca} ${g.motivo.padEnd(36)} ${String(g.filas).padStart(5)} fila(s) · `
    + `${pesos(g.importe).padStart(16)} facturado · ${pesos(g.pendiente).padStart(16)} sin pagar`
}

/** El Libro, reducido a lo único que este auditor necesita: de qué fila de qué pestaña vino cada movimiento. */
async function leerLibro(google) {
  const v = await google.readSheetValues(ID, '_MOVIMIENTOS!A1:Q', { render: 'UNFORMATTED_VALUE' })
  if (!v?.length) {
    throw new Error('_MOVIMIENTOS está vacía o no se pudo leer. Sin el Libro, este control diría que '
      + 'NADA llega al Cash Flow: eso es un falso positivo del tamaño del archivo entero, no un hallazgo.')
  }
  return v.slice(1).map((f) => ({
    origen: f?.[COL.origen], fila: f?.[COL.fila],
    cuit: f?.[COL.cuit], comprobante: f?.[COL.comprobante], importe: f?.[COL.importe],
  }))
}

main().catch((e) => { console.error(`⛔ ${e.message}`); process.exitCode = 1 })
