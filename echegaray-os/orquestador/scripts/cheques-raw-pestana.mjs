#!/usr/bin/env node
// _CHEQUES_RAW — LOS CHEQUES ADENTRO DEL SHEET. Hermana de _BANCO_RAW y _ARCA_RAW.
//
// POR QUÉ (30/07). Misma regla que las otras dos réplicas:
//
//     Si el insumo no está en el archivo, se trae el INSUMO — no se pega el RESULTADO.
//
// Los cheques ya entran a la base por `importar-cheques.mjs` (con control de cierre de la orden de
// pago y cruce contra el extracto), pero el Sheet no los veía: la pestaña "Cheques Recibidos" seguía
// leyendo un array escrito a mano en `lib/cheques-recibidos.mjs` con corte 22/07, y "Cheques
// Emitidos" no tenía de dónde tomar los eCHEQ del banco. Sin esta réplica, cualquier número de
// cartera en el Sheet tendría que calcularse afuera y pegarse — y un número pegado envejece en
// silencio: se cobra un cheque y el cuadro sigue mostrando el de ayer.
//
// ES UNA RÉPLICA, Y SE DECLARA COMO TAL: la fila 1 dice de qué fuente es, a qué fecha está cortada y
// cuándo se sacó. Una réplica que no dice cuándo se sacó envejece sin gritar — el defecto que ya
// rompió el espejo de JORNALES y el IPC en este mismo archivo.
//
// UNA FILA ES UN CHEQUE, NO UNA OPERACIÓN. Es la diferencia que hace que la cartera se pueda sumar:
// la pantalla de operaciones del banco lista cada paso del ciclo de vida (Aceptación → Custodia →
// Depósito, o Aceptación → Endoso) y sumar eso cuenta el mismo valor tres veces.
//
//   node orquestador/scripts/cheques-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { query, closePool } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_CHEQUES_RAW'
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es CONTRATO: las fórmulas de las pestañas visibles lo referencian. */
export const COLUMNAS = [
  ['Tipo', 'texto'], ['Número', 'texto'], ['Banco', 'texto'], ['Librador', 'texto'],
  ['Contraparte', 'texto'], ['Fecha de pago', 'fecha'], ['Importe', 'monedaExacta'],
  ['Estado', 'texto'], ['Cuenta', 'texto'], ['Orden de pago', 'texto'], ['Obra', 'texto'],
]
export const COL = {
  tipo: 'A', numero: 'B', banco: 'C', librador: 'D', contraparte: 'E',
  fechaPago: 'F', importe: 'G', estado: 'H', cuenta: 'I', ordenPago: 'J', obra: 'K',
}
export const FILA0 = 4

/** NÚCLEO PURO: una fila de la réplica. Sin red ni base. */
export function fila(c) {
  return [
    String(c.tipo ?? ''),
    String(c.numero ?? ''),
    String(c.banco ?? ''),
    String(c.librador ?? ''),
    String(c.contraparte ?? ''),
    c.fecha_pago ? String(c.fecha_pago).slice(0, 10) : '',
    Number(c.importe) || 0,
    String(c.estado ?? ''),
    String(c.cuenta ?? ''),
    String(c.orden_pago ?? ''),
    String(c.obra ?? ''),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ORDEN CONTRATO: recibidos primero (la cartera que se vuelve caja), después emitidos (lo que sale),
  // y dentro de cada uno por fecha de pago — que es cuándo el valor se convierte en plata.
  const { rows } = await query(
    `select tipo, numero, banco, librador, contraparte, fecha_pago, importe, estado,
            cuenta, orden_pago, obra, corte
       from public.cheques
      order by tipo desc, (fecha_pago is null), fecha_pago, numero`)
  if (!rows.length) {
    console.log('public.cheques está vacía — corré importar-cheques.mjs primero. No escribo nada.')
    return
  }
  const datos = rows.map(fila)
  const corteData = rows.reduce((mx, r) => {
    const c = r.corte instanceof Date ? r.corte.toISOString().slice(0, 10) : String(r.corte).slice(0, 10)
    return c > mx ? c : mx
  }, '0000-00-00')
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  const porEstado = new Map()
  rows.forEach((r) => {
    const k = `${r.tipo}·${r.estado}`
    porEstado.set(k, (porEstado.get(k) ?? 0) + Number(r.importe))
  })
  console.log(`fuente: public.cheques — ${datos.length} cheque(s) · corte ${corteData}`)
  for (const [k, v] of [...porEstado.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} $${Math.round(v).toLocaleString('es-AR')}`)
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: datos.length + 40, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(datos.length + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }

  const gridRaw = [
    [`${PESTAÑA} — cheques y eCHEQ · corte ${corteData} · réplica del ${corte}`],
    [`${datos.length} cheques, UNO POR FILA (no una fila por operación: sumar operaciones cuenta el mismo cheque varias veces). NO se carga a mano: entra por scripts/importar-cheques.mjs, que verifica el cierre de la orden de pago y cruza el depósito contra el extracto. Existe para que los números de cartera del Sheet sean FÓRMULAS y no valores calculados afuera y pegados. "recibido" = valor de un tercero que se vuelve caja en su fecha de pago; "emitido" = plata firmada que todavía no salió de la cuenta.`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]

  // LA COLA DE UNA CORRIDA ANTERIOR. Esta réplica puede ACORTARSE (un cheque mal cargado que se
  // borra de la base), y las filas de más abajo SOBREVIVIRÍAN en silencio: la cartera mostraría un
  // cheque que ya no existe. Se extiende con el centinela VACIO —"es mi celda y va vacía"— que limpia
  // lo que dejó este generador y CONSERVA cualquier anotación de una persona en una columna que no ocupa.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:${COL.obra}1000`).catch(() => [])
  let ultimaConDato = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaConDato = i + 1 })
  if (ultimaConDato > gridRaw.length) {
    console.log(`  cola de una corrida anterior: limpio las filas ${gridRaw.length + 1}–${ultimaConDato}`)
    for (let i = gridRaw.length; i < ultimaConDato; i++) gridRaw.push(Array(COLUMNAS.length).fill(VACIO))
  }

  // espejo: true — es la copia de una fuente externa (las pantallas del banco). No hay nada del dueño
  // que proteger acá, y `respetar` congelaría el nombre de un estado si el banco lo cambiara.
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, gridRaw, {
    respetar: false, espejo: true, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length),
  })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 4 ? 260 : j === 3 ? 200 : 120 }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // VERIFICACIÓN: tantas filas escritas como cheques, y ninguna en error.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.numero}${FILA0}:${COL.importe}${FILA0 + datos.length}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const errores = v.flat().filter((c) => /#(ERROR|REF|N\/A|VALUE|NAME)/i.test(String(c ?? ''))).length
  console.log(`${PESTAÑA}: ${datos.length} cheques · ${escritas} escritos · ${errores} en error`)
  if (escritas !== datos.length || errores) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
