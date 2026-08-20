#!/usr/bin/env node
// LA OBRA QUE FALTABA VA A LA COLUMNA DE COMPRAS, NO A UNA TABLA DEL CÓDIGO.
//
// ═══ POR QUÉ EXISTE (17/08/2026) ═══
//
// El cuadro 4 de la pestaña OBRAS publicaba $0 en cuatro obras y el dueño reclamó, dos veces, que
// había gastos hechos para ellas: *"hay mas gastos en compras de algunas de las obras nuevas q no
// estan siendo considerados"* y después, sobre el cuadro entero: *"esos valores de ese cuadro en
// pestaña obras, es lo q te estoy pidiendo q corrijas"*.
//
// La causa del $0 en el MECANISMO ya se corrigió aparte (`obras-datos.mjs`: una obra sin patrón
// declarado tenía la celda muerta en `'=0'`). Pero el número no se movía por una razón distinta y
// más simple: **Compras no dice a qué obra va ese gasto**. Se revisaron las 38 columnas: la única
// que puede decirlo es la K, "Detalles / Obra", y en esas filas alguien escribió la descripción del
// producto. La "Unidad de Negocio" (col I) sólo tiene Civil / Estructura / Impuestos / Mantenimiento
// / Financiero: no identifica la obra.
//
// O sea que el dato NO EXISTÍA EN NINGUNA FUENTE. No es algo que se pueda deducir: es algo que sabe
// una persona. Se preguntó, y las respuestas están abajo con su cita.
//
// ═══ POR QUÉ NO SE DEDUJO, QUE ES LO IMPORTANTE ═══
//
// La inferencia estaba servida y era ELEGANTE: la factura de Trielec son 7 proyectores LED y 100 m
// de cable, facturada el 12/08, y la obra "INSTALACIÓN ELÉCTRICA" arranca el 10/08 y publicaba $0.
// Todo cerraba. **Y estaba mal**: el dueño contestó que va a PISOS INDUSTRIALES. Si se hubiera
// publicado la deducción, $1.831.905 habrían quedado en la obra equivocada con aspecto de hecho, y
// nadie lo habría notado nunca — que es exactamente el error que el cuadro 4 está construido para
// impedir. Ésta es la prueba, con nombre y monto, de por qué acá se pregunta.
//
// ═══ CÓMO ESCRIBE, Y POR QUÉ NO ROMPE NADA ═══
//
// · ANTEPONE, no reemplaza: `"Pisos Industriales · <lo que ya decía>"`. El texto viejo es de una
//   persona y muchas veces lleva datos que no están en ninguna otra columna ("Pagada 12/08/2026 con
//   Electron, 1 cuota · sello"). Un generador no borra lo que no escribió.
// · Ubica la fila por CLIENTE + FECHA + PROVEEDOR + IMPORTE AL CENTAVO, nunca por número de fila:
//   Compras crece todos los días y anclar en la posición es el defecto que ya costó caro acá.
// · Exige UNA sola coincidencia. Cero o dos, aborta sin escribir nada: imputar la fila equivocada es
//   peor que no imputar ninguna.
// · Es idempotente: si la K ya contiene el patrón de la obra, no la vuelve a tocar.
// · Escribe SÓLO la columna K. Nunca AC/AD/AE/AF/AJ, que son del OS y tienen su propio contrato.
// · Verifica releyendo el archivo, celda por celda.
//
//   node orquestador/scripts/compras-imputar-obra.mjs             → dice qué haría, no escribe
//   node orquestador/scripts/compras-imputar-obra.mjs --aplicar   → escribe y verifica releyendo

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = 'Compras'
const FILA0 = 4

/** Las columnas de Compras que este bisturí lee. La K es la única que escribe. */
export const COL = { fecha: 2, proveedor: 4, cliente: 9, obra: 10, neto: 12 }

/**
 * LO QUE EL DUEÑO CONTESTÓ, CON SU CITA. Sin la pregunta y la respuesta textuales, en seis meses
 * nadie va a poder distinguir esto de una suposición que alguien escribió con confianza.
 *
 * 17/08/2026 — Se le mostró el cuadro 4 con las cuatro obras en $0 y las compras de agosto que no
 * llegaban a ninguna obra. Preguntas y respuestas:
 *
 *   · "Trielec 12/08, $1.831.905, 7 proyectores Led Stadium + 100 m de cable TT. ¿A qué obra va?"
 *     → **"Pisos Industriales"**  (NO Instalación Eléctrica, que era la inferencia obvia)
 *   · "MESSINA, «Clasificación de Escombros» $2.300.000 y «Mini Excavadora» $388.070. ¿A qué obra?"
 *     → **"BSA"**
 *   · "San Francisco, $464.769 de consumibles con 4 obras abiertas. ¿Qué hago?"
 *     → **"Dejar sin imputar"**  ← por eso NO están en esta lista: la respuesta fue no tocarlas.
 */
export const IMPUTACIONES_CONFIRMADAS = [
  // El neto lleva los centavos: la pantalla muestra $1.831.905 y el archivo dice 1831905,12. El
  // comparador al centavo rechazó la primera versión de esta línea, que es exactamente su trabajo —
  // un importe redondeado "casi igual" es como se imputa la fila equivocada.
  { cliente: 'San Francisco', fecha: '2026-08-12', proveedor: 'Trielec', neto: 1_831_905.12, obra: 'Pisos Industriales' },
  { cliente: 'MESSINA', fecha: '2026-08-03', proveedor: 'Gerson Castro', neto: 2_300_000, obra: 'BSA' },
  { cliente: 'MESSINA', fecha: '2026-08-04', proveedor: 'DUPEC', neto: 388_070, obra: 'BSA' },
]

export const MOTIVO = 'el dueño lo confirmó el 17/08/2026 · Compras no tiene ninguna columna que lo diga'

const cent = (x) => Math.round((Number(x) || 0) * 100)
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const norm = (x) => String(x ?? '').trim()
export const iso = (s) => (Number.isFinite(Number(s)) && Number(s) > 0
  ? new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10) : '')

/**
 * NÚCLEO PURO: qué celda hay que escribir por cada imputación confirmada.
 *
 * @param {Array<Array>} filas la grilla de Compras desde `fila0`, cruda
 * @param {number} fila0 número de la primera fila de `filas` en la pestaña
 * @param {Array} objetivos las imputaciones confirmadas
 * @returns {{aEscribir:Array, yaEstaban:Array, problemas:Array}}
 */
export function planDeImputacion(filas = [], fila0 = FILA0, objetivos = IMPUTACIONES_CONFIRMADAS) {
  const aEscribir = []; const yaEstaban = []; const problemas = []
  for (const o of objetivos) {
    const hits = []
    filas.forEach((f, i) => {
      if (norm(f?.[COL.cliente]) !== o.cliente) return
      if (iso(f?.[COL.fecha]) !== o.fecha) return
      if (norm(f?.[COL.proveedor]) !== o.proveedor) return
      if (cent(f?.[COL.neto]) !== cent(o.neto)) return
      hits.push({ fila: fila0 + i, k: norm(f?.[COL.obra]) })
    })
    // CERO o DOS coincidencias es un problema, no un caso a resolver por criterio: escribir la fila
    // equivocada mete plata en la obra equivocada, que es el único error que este cuadro no perdona.
    if (hits.length !== 1) {
      problemas.push({ ...o, cuantas: hits.length })
      continue
    }
    const [h] = hits
    if (h.k.toLowerCase().includes(o.obra.toLowerCase())) { yaEstaban.push({ ...o, fila: h.fila, k: h.k }); continue }
    // ANTEPONE. El texto de la persona queda entero detrás del separador.
    aEscribir.push({ ...o, fila: h.fila, antes: h.k, despues: h.k ? `${o.obra} · ${h.k}` : o.obra })
  }
  return { aEscribir, yaEstaban, problemas }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)

  const filas = await google.readSheetValues(ID, `'${PESTANA}'!A${FILA0}:Y${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  const { aEscribir, yaEstaban, problemas } = planDeImputacion(filas, FILA0)

  console.log(`«${PESTANA}» · ${IMPUTACIONES_CONFIRMADAS.length} imputación(es) confirmadas`)
  console.log(`  ${MOTIVO}\n`)
  for (const p of problemas) {
    console.error(`  ✖ ${p.obra} ← ${p.proveedor} ${p.fecha} ${plata(p.neto)}: ${p.cuantas} coincidencia(s), esperaba 1`)
  }
  for (const y of yaEstaban) console.log(`  ✋ fila ${y.fila} ya dice "${y.k}": no la toco`)
  for (const e of aEscribir) {
    console.log(`  ✎ fila ${e.fila} · ${e.proveedor} ${e.fecha} ${plata(e.neto)}`)
    console.log(`      K: "${e.antes}"`)
    console.log(`       → "${e.despues}"`)
  }
  if (problemas.length) { console.error('\n✖ una imputación sin fila única no se escribe. No toqué nada.'); process.exit(1) }
  if (!aEscribir.length) { console.log('\n✓ no hay nada que escribir: todas ya dicen su obra.'); return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }

  const req = aEscribir.map((e) => ({ updateCells: {
    range: { sheetId: hoja.sheetId, startRowIndex: e.fila - 1, endRowIndex: e.fila, startColumnIndex: COL.obra, endColumnIndex: COL.obra + 1 },
    rows: [{ values: [{ userEnteredValue: { stringValue: e.despues } }] }],
    fields: 'userEnteredValue',
  } }))
  const r = await google.spreadsheetBatchUpdate(ID, req)
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no escribí nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee el archivo, celda por celda.
  const despues = await google.readSheetValues(ID, `'${PESTANA}'!A${FILA0}:Y${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  let mal = 0
  for (const e of aEscribir) {
    const leido = norm(despues[e.fila - FILA0]?.[COL.obra])
    if (leido === e.despues) console.log(`  ✓ fila ${e.fila} · K = "${leido}"`)
    else { mal++; console.error(`  ✖ fila ${e.fila} · esperaba "${e.despues}" y el archivo dice "${leido}"`) }
  }
  const { aEscribir: quedan } = planDeImputacion(despues, FILA0)
  if (quedan.length) { mal++; console.error(`  ✖ quedan ${quedan.length} sin imputar después de escribir`) }
  if (mal) { console.error('\n✖ el archivo no dice lo que escribí.'); process.exit(1) }
  const total = aEscribir.reduce((s, e) => s + e.neto, 0)
  console.log(`\n✓ ${aEscribir.length} compra(s) por ${plata(total)} ahora dicen a qué obra van.`)
  console.log('  El cuadro 4 las toma solo: la fórmula ya estaba viva esperando el texto.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
