#!/usr/bin/env node
// SACAR DE "JORNALES POR QUINCENA" LAS CINCO CELDAS QUE DEJÓ EL REDISEÑO DEL 13/08.
//
// ═══ QUÉ SACA, Y QUÉ NO ═══
//
// El dueño, mirando la pestaña: *"estoy viendo q hay palabras sueltas en lugares q no deben ir y
// cuadros rotos"*. Tenía razón. La mayor parte de esa basura la cura ahora el generador solo —el
// veredicto de residuo de rediseño de `huella-celda.mjs` le devuelve a `E78` su «Convenio (tuya)», a
// `F80` el básico de convenio y a `F40` el lookup del banco de mayo—. Este script es para las que el
// generador NO PUEDE curar, porque están en columnas donde por diseño no escribe:
//
//   E76 · E79   la columna «Convenio (tuya)» del bloque 4.1, declarada del dueño el 07/08
//   N110 · N113 · N114   la columna «Pagado el» del registro, declarada 100% suya el 31/07
//
// Esa protección no se afloja: es la que evitó seis pérdidas de trabajo del dueño. Lo que se hace en
// su lugar es una limpieza DECLARADA — la lista está escrita acá abajo, celda por celda, y para cada
// una hay que poder probar que es del OS. La prueba vive en `lib/jornales-residuo.mjs` y es la misma
// para las cinco: la cosa que hay en la celda está VIVA, hoy, adentro de la tabla, en su columna.
//
// NO HAY `clearValues` NI BARRIDO. Se vacían cinco celdas nombradas, una por una, y la escritura pasa
// por `vaciarPropio` — que relee el destino y decide él. Si entre la lectura y la escritura el dueño
// escribe cualquier otra cosa ahí, ya no coincide y la celda se conserva.
//
// Sin `--aplicar` no escribe una sola celda.
//
//   node orquestador/scripts/limpiar-residuo-jornales.mjs
//   node orquestador/scripts/limpiar-residuo-jornales.mjs --aplicar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'
import { residuosDeclarados, candidatasDeBancoOficina, candidatasDeBancoDireccion } from '../lib/jornales-residuo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const APLICAR = process.argv.includes('--aplicar')
const HASTA = 140

/**
 * LAS CINCO CELDAS, Y CONTRA QUÉ TABLA VIVA SE PRUEBA CADA UNA.
 *
 * `tabla` no es "donde creo que estaba": es el rango de filas del cuadro que HOY está publicado y que
 * el generador sí posee. E52:E70 es el bloque 3 (Dirección) con su «Desde» y su «Se paga el»;
 * N115:N130 es el registro de obra con su encabezado y sus quincenas.
 *
 * SE EXPORTA para que el test la ejerza tal cual. Una lista de celdas a borrar que el test no ve es
 * una lista sin control — y las dos últimas son fechas que carga el dueño.
 */
export const CANDIDATAS = [
  { fila: 76, col: 4, tabla: [52, 70] },   // E76  copia de «Desde» del bloque 3, pintada como moneda
  { fila: 79, col: 4, tabla: [52, 70] },   // E79  copia de «Se paga el» del bloque 3
  { fila: 110, col: 13, tabla: [115, 130] }, // N110 encabezado «Pagado el» duplicado arriba del registro
  { fila: 113, col: 13, tabla: [115, 130] }, // N113 serial 46038 — vivo en N116
  { fila: 114, col: 13, tabla: [115, 130] }, // N114 serial 46055 — vivo en N117
]

/**
 * CUÁNTAS CELDAS ES CREÍBLE VACIAR EN ESTA PESTAÑA. Las declaradas a mano más, como mucho, los doce
 * meses de la columna «Banco» de CADA uno de los dos cuadros mensuales —Oficina y Dirección—. Si
 * alguna vez se probaran más, es que alguien amplió la lista sin mirar —o que un ancla cayó en otro
 * cuadro— y entonces no escribo.
 */
const TOPE = CANDIDATAS.length + 24

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // Render FORMULA: una celda con `=IFERROR(...;"")` se VE vacía y tiene contenido. Leer lo visible
  // haría que dos residuos distintos se parecieran, y que uno vivo pareciera ausente.
  const grid = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:N${HASTA}`, { render: 'FORMULA' })
    .catch((e) => { throw new Error(`no pude leer "${PESTAÑA}" (${e.message}). NO escribo a ciegas.`) })

  // LAS DECLARADAS A MANO, MÁS LA COLUMNA «Banco» DE OFICINA UBICADA POR SU ENCABEZADO. Esa columna no
  // se puede escribir con números de fila: el bloque se corre un renglón cada vez que entra una línea
  // arriba, y una coordenada vieja borra la celda de al lado. La prueba es la misma para todas — la
  // cosa que hay en la celda está viva, hoy, en su columna, adentro de otro cuadro.
  // LOS DOS CUADROS MENSUALES, NO UNO. Oficina y Dirección tienen el MISMO encabezado y hasta el
  // 15/08 sólo se miraba el primero: la «Banco» de Dirección publicaba `F88 = "Básico convenio"`
  // —encabezado del bloque 4.1, que hoy vive en F96— arriba del renglón de Diciembre, y ningún
  // control la nombraba. Ver `encabezadosDeMesBanco`.
  const candidatas = [...CANDIDATAS, ...candidatasDeBancoOficina(grid), ...candidatasDeBancoDireccion(grid)]
  const { vaciables, conservadas } = residuosDeclarados(grid, candidatas)
  for (const c of conservadas) {
    console.log(`  ✋ ${letraCol(c.col)}${c.fila} = "${c.valor}" — ${c.motivo}`)
  }
  for (const v of vaciables) {
    console.log(`  🧹 ${letraCol(v.col)}${v.fila} = "${v.valor}" — ${v.motivo}`)
  }
  if (!vaciables.length) return console.log('\n  nada que probar como propio. Nada se tocó.')
  if (vaciables.length > TOPE) {
    return console.warn(`\n  ⛔ ${vaciables.length} candidatas probadas y el tope es ${TOPE}. No escribo — miralo antes.`)
  }
  if (!APLICAR) return console.log(`\n  (ensayo) vaciaría ${vaciables.length} celda(s). Agregá --aplicar para escribir.`)

  // La guarda relee el destino y decide ella: `mios` es lo que ACABO de leer ahí, no lo que supongo.
  const data = vaciables.map((v) => ({ range: `'${PESTAÑA}'!${letraCol(v.col)}${v.fila}`, values: [['']] }))
  const r = await google.batchUpdateValues(ID, data, { vaciarPropio: { mios: vaciables.map((v) => v.valor) } })
  if (r?.protegido) return console.warn(`  ⛔ la guarda no dejó pasar la escritura: ${r.motivo ?? 'sin motivo'}`)
  console.log(`\n  ${vaciables.length} celda(s) vaciada(s). RELEÉ LA PESTAÑA: lo que quedó es la evidencia, no este mensaje.`)
}

// Sólo corre como script: el test importa `CANDIDATAS` y no puede disparar una escritura al hacerlo.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error(`  ⛔ ${e.message}`); process.exitCode = 1 })
}
