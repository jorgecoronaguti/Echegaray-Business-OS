#!/usr/bin/env node
// EL SEMBRADOR DE LOS DOS TÍTULOS QUE NADIE REPONÍA.
//
// Los títulos "1 · QUÉ SE DEBE Y CUÁNDO" y "2 · CUENTA CORRIENTE POR PROVEEDOR" son el ANCLA de las
// dos tablas dinámicas y no tenían dueño: si el dueño borra esa celda, los dos generadores fallan
// cerrado —correcto— y la pestaña se congela en silencio hasta que alguien lo note. Ya pasó con "3 ·
// NOTAS DE CRÉDITO" y costó días de una pestaña quieta mostrando restos de corridas viejas.
//
// ESTE PASO ESCRIBE UNA CELDA Y NADA MÁS. No limpia un ancho, no inserta filas, no toca el cuerpo de
// una dinámica —un centinela VACIO sobre un pivot lo borra— y no escribe si la celda de destino
// tiene algo. El criterio de dónde va y cuándo se escribe es núcleo puro y está probado en
// `lib/proveedores-titulos.mjs`; acá queda sólo la plomería: leer, mostrar, escribir, releer.
//
//   node orquestador/scripts/proveedores-titulos-sembrar.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-titulos-sembrar.mjs --aplicar  → escribe y verifica

import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { nSeccion } from '../lib/proveedores-frontera.mjs'
import { aEscribir, planDeSiembra } from '../lib/proveedores-titulos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
/** Hasta dónde se busca. Las dos secciones dinámicas viven arriba de todo; de sobra. */
const TECHO = 300

/** Qué significa cada estado cuando NO se escribe. Se dice entero: un log mudo no es un control. */
const PORQUE = {
  presente: 'está y dice lo que tiene que decir',
  'sin-rotulos': 'falta el título Y la fila de rótulos de la sección: no hay de dónde deducir dónde va'
    + ' — hay que reponerlo a mano o volver a correr la dinámica con la pestaña sana',
  ocupada: 'la celda donde iría tiene algo: la pestaña no tiene la forma que este paso espera,'
    + ' y sobrescribir a ciegas es exactamente lo que este paso no hace',
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(ID, `${PESTAÑA}!A1:H${TECHO}`, { render: 'FORMATTED_VALUE' })
  const plan = planDeSiembra({ filas: filas ?? [], numero: nSeccion })

  for (const p of plan) {
    if (p.estado === 'siembra') console.log(`↧ A${p.fila} ← "${p.texto}" (falta y la celda está vacía)`)
    else if (p.estado === 'renumerado') console.log(`↧ A${p.fila} ← "${p.texto}" (estaba con otro número)`)
    else console.log(`· ${p.texto}: ${PORQUE[p.estado] ?? p.estado}`)
  }

  const escribir = aEscribir(plan)
  if (!escribir.length) { console.log('\nno hay nada que sembrar'); return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const sid = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)?.sheetId
  if (!Number.isInteger(sid)) throw new Error('no pude resolver la pestaña: no escribo a ciegas')

  // UNA CELDA POR TÍTULO, con el formato de rótulo de bloque que declara `estilo-pestana`. El formato
  // va porque la celda puede venir sin él —si se borró la fila entera y no sólo el texto— y un título
  // que se lee como cuerpo no es un título. Sigue siendo UNA celda (`endColumnIndex` = la A) y los
  // campos van enumerados: `userEnteredFormat` a secas reemplaza el formato ENTERO y se llevaría por
  // delante lo que este paso no declara (un borde, un alto heredado).
  await google.spreadsheetBatchUpdate(ID, escribir.map((p) => ({ updateCells: {
    range: { sheetId: sid, startRowIndex: p.fila - 1, endRowIndex: p.fila, startColumnIndex: 0, endColumnIndex: 1 },
    rows: [{ values: [{ userEnteredValue: { stringValue: p.texto }, userEnteredFormat: E.bloque() }] }],
    fields: 'userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,'
      + 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy',
  } })), { espejo: true })

  // LA EVIDENCIA ES DEL EFECTO: se relee y se pide que el plan sobre la pestaña nueva diga "presente".
  // Se verifica SÓLO lo que este paso escribió. Un título que no se pudo sembrar ya salió avisado
  // arriba y no lo produjo esta corrida: los pasos que lo necesitan fallan cerrado por su cuenta, y
  // hacer fallar acá al pipeline entero taparía la frescura de catorce pestañas sanas.
  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:H${TECHO}`, { render: 'FORMATTED_VALUE' })
  const ahora = planDeSiembra({ filas: despues ?? [], numero: nSeccion })
  for (const p of escribir) {
    const nuevo = ahora.find((x) => x.clave === p.clave)
    const leido = String((despues?.[(nuevo?.fila ?? 0) - 1] ?? [])[0] ?? '')
    if (nuevo?.estado === 'presente') console.log(`✓ A${nuevo.fila} dice "${leido}", releído del archivo`)
    else { console.error(`✗✗ "${p.texto}" no quedó escrito: sigue en "${nuevo?.estado}"`); process.exitCode = 1 }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
