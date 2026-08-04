#!/usr/bin/env node
// LA SECCIÓN 1 DE PROVEEDORES, EN DOS TABLAS DINÁMICAS NATIVAS.
//
// El pedido: "necesito ver los totales de lo que le debo a cada proveedor y luego ver dentro cada
// operación". Una sola dinámica no puede: la API de Sheets NO emite el subtotal de un nivel externo
// —sólo el gran total del pie—, y está medido contra el archivo real con dos y con seis niveles.
// `showTotals: true` en el proveedor no produce la fila "Alumetal · total".
//
// Entonces son dos, las dos vivas y las dos dinámicas:
//   A · QUIÉN Y CUÁNTO  — una línea por proveedor: cuánto se le debe y en cuántas facturas.
//   B · CADA OPERACIÓN  — una línea por factura: número, cuándo, obra, con qué se paga, categoría.
//
// Las dos cuelgan del mismo origen (la grilla entera de Compras) y del mismo filtro, así que no
// pueden decir cosas distintas: si una compra entra, entra en las dos.
//
//   node orquestador/scripts/proveedores-dos-cuadros.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-dos-cuadros.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diferenciasDeHuella, huellaProtegida } from '../lib/proveedores-bloque-vivo.mjs'
import { COLCHON_FINAL, filaDelSiguienteTitulo, filasNoVacias, sobranteDeColchon } from '../lib/proveedores-colchon.mjs'
import {
  altoEmitido, bandasDeFormato, COL, filtros, formatoDeTodo, fuenteCompras, geometriaDeLaSeccion,
  PENDIENTE, VISTA,
} from '../lib/proveedores-pivot-seccion1.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
// A cuánto se lleva la grilla de Compras. Con 817 filas usadas y ~90 comprobantes por mes, esto son
// más de quince años de margen: el origen deja de ser algo que haya que recordar.
const MINIMO_GRILLA_COMPRAS = 3000
// Lo que se RESERVA de una cuando hay que insertar. Insertar de a una fila cuesta una corrida
// entera, así que cuando no entra se pide holgura — y al final de la corrida se devuelve lo que
// sobró (ver `recortarElAire`). El colchón que QUEDA puesto es `COLCHON_FINAL`, chico y a propósito.
const COLCHON = 12
/** Hasta dónde se mira el ancho para decidir si una fila está vacía. Bien a la derecha del bloque. */
const ANCHO_LECTURA = 'AZ'

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** A · una línea por proveedor. COUNTA sobre el proveedor —no sobre el comprobante—: hay una factura
 *  sin número y contando comprobantes mostraba "0 facturas" a quien se le deben $100.000. */
const cuadroTotales = (fuente) => ({
  source: fuente,
  rows: [{ sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } }],
  values: [
    { sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Se le debe' },
    { sourceColumnOffset: COL.proveedor, summarizeFunction: 'COUNTA', name: 'Facturas' },
  ],
  filterSpecs: filtros(),
  valueLayout: 'HORIZONTAL',
})

/** B · una línea por factura, con todo lo que hace falta para decidir un pago. */
const cuadroDetalle = (fuente) => ({
  source: fuente,
  rows: [
    { sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.proximoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.obra, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.tipoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.categoria, showTotals: false, sortOrder: 'ASCENDING' },
  ],
  values: [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' }],
  filterSpecs: filtros(),
  valueLayout: 'HORIZONTAL',
})

const texto = (sheetId, fila, valor, bold = false) => ({ updateCells: {
  range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: 0, endColumnIndex: 1 },
  rows: [{ values: [{ userEnteredValue: { stringValue: valor }, userEnteredFormat: { textFormat: { bold } } }] }],
  fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const pendientes = (compras ?? []).filter((f) => String(f?.[COL.estado] ?? '').trim() === PENDIENTE
    && String(f?.[COL.comercial] ?? '').trim() === '1')
  const proveedores = new Set(pendientes.map((f) => String(f?.[COL.proveedor] ?? '').trim())).size
  const total = pendientes.reduce((a, f) => a + (Number(f?.[COL.saldo]) || 0), 0)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const geo = geometriaDeLaSeccion(visible)

  // Dónde va cada cuadro y qué franja se formatea. El alto de un pivot es una ESTIMACIÓN y el
  // formato NO se mide con ella: las bandas cubren el footprint entero — ver `bandasDeFormato`.
  let plan = bandasDeFormato({ ...geo, proveedores, facturas: pendientes.length })

  console.log(`PROVEEDORES ${proveedores} · FACTURAS ${pendientes.length} · TOTAL ${plata(total)}`)
  console.log(`A (quién y cuánto) ${plan.altoA} filas · B (cada operación) ${plan.altoB} filas`
    + ` · necesita ${plan.necesita}, hay ${plan.disponibles}`)
  const faltan = plan.necesita > plan.disponibles ? plan.necesita - plan.disponibles + COLCHON : 0
  if (faltan) console.log(`⚠ se insertan ${faltan} fila(s) antes de la sección 2 (fila ${geo.filaLimite})`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const compraMeta = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sheetId) || !(compraMeta?.rows > 3)) throw new Error('no pude resolver las pestañas: no escribo a ciegas')

  // ═══ EL ORIGEN NO SE PUEDE QUEDAR CORTO ═══
  //
  // El origen de una dinámica es un rango FIJO. Si termina donde hoy termina la grilla de Compras,
  // el día que se llene los comprobantes nuevos caen afuera y NO DA ERROR: simplemente dejan de
  // aparecer, y el cuadro miente hacia abajo sin que nada avise. Se agranda la grilla para que el
  // origen tenga años de aire; una fila vacía de más en Compras no le hace nada a nadie.
  const filasCompras = Math.max(compraMeta.rows, MINIMO_GRILLA_COMPRAS)
  if (filasCompras > compraMeta.rows) {
    console.log(`la grilla de Compras pasa de ${compraMeta.rows} a ${filasCompras} filas (para que el origen no se quede corto)`)
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: {
      sheetId: compraMeta.sheetId, dimension: 'ROWS', length: filasCompras - compraMeta.rows } }], { espejo: true })
  }
  const fuente = fuenteCompras({ sheetId: compraMeta.sheetId, filas: filasCompras })

  if (faltan) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: geo.filaLimite - 1, endIndex: geo.filaLimite - 1 + faltan },
      inheritFromBefore: true } }], { espejo: true })
    geo.filaLimite += faltan
    // El colchón recién insertado forma parte del footprint: la banda de formato se recalcula para
    // llegar hasta el final, o las filas nuevas quedan crudas la primera vez que se usen.
    plan = bandasDeFormato({ ...geo, proveedores, facturas: pendientes.length })
  }

  // La huella se toma DESPUÉS de insertar: si no, compara filas corridas y grita diferencias falsas.
  const base = faltan ? await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' }) : antes
  const huellaAntes = huellaProtegida(base, { ...geo, ancho: 7 })

  const { iA, iSub, iB, finIdx, bandaA, bandaB } = plan
  if (!(bandaA.alto > 0 && bandaB.alto > 0)) {
    throw new Error('el bloque no entra ni después de insertar filas: no formateo un rango vacío')
  }

  const vacias = Array.from({ length: finIdx - iA }, () => ({ values: Array.from({ length: 7 }, () => ({ userEnteredValue: null })) }))
  const anclaPivot = (fila, pivot) => ({ updateCells: {
    range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: 0, endColumnIndex: 1 },
    rows: [{ values: [{ pivotTable: pivot }] }], fields: 'pivotTable' } })

  // ═══ NINGUNA DINÁMICA VIEJA SOBREVIVE, ESTÉ DONDE ESTÉ ═══
  //
  // Limpiar el rectángulo [iA, finIdx) alcanza mientras el plan caiga donde cayó la corrida
  // anterior. El día que no —porque el cuadro dio #REF! y la detección se corrió— la dinámica
  // vieja queda FUERA del rectángulo, sobrevive, y las dos se pisan. Se enumeran los anclajes de
  // verdad, leyendo la grilla, y se anulan uno por uno.
  // El barrido arranca en la fila 1, no cerca del plan: una dinámica huérfana puede haber quedado
  // MÁS ARRIBA que donde el plan de hoy pone el cuadro, y ahí es donde estaba la que sobrevivió.
  // El límite es la sección 2, que tiene su propia dinámica y no se toca.
  const grid = await google.getGridData(ID, `${PESTAÑA}!A1:A${geo.filaLimite - 1}`)
  const viejas = (grid?.sheets?.[0]?.data?.[0]?.rowData ?? [])
    .map((r, i) => (r?.values?.[0]?.pivotTable ? i : -1))
    .filter((i) => i >= 0 && (i < iA || i >= finIdx))
  if (viejas.length) console.log(`⚠ ${viejas.length} dinámica(s) fuera del plan: filas ${viejas.map((i) => i + 1).join(', ')} — se anulan`)

  await google.spreadsheetBatchUpdate(ID, [
    ...viejas.map((i) => ({ updateCells: {
      range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: null }] }], fields: 'userEnteredValue,pivotTable' } })),
    // Limpiar el ancho entero del bloque, incluidas las dinámicas viejas.
    { updateCells: { range: { sheetId, startRowIndex: iA, endRowIndex: finIdx, startColumnIndex: 0, endColumnIndex: 7 },
      rows: vacias, fields: 'userEnteredValue,pivotTable' } },
    anclaPivot(iA, cuadroTotales(fuente)),
    texto(sheetId, iSub, 'Cada operación', true),
    anclaPivot(iB, cuadroDetalle(fuente)),
    // CADA COLUMNA, DECLARADA EN CADA CORRIDA Y SOBRE EL FOOTPRINT ENTERO. Una dinámica no trae
    // formato: usa el que la celda ya tenía. Midiendo la banda con el alto de la corrida, el cuadro
    // A creció a 10 proveedores y la 10ª fila salió `67797,51 | 31/12/1899` — la columna B en TEXTO
    // y la C en FECHA, que es lo que el cuadro B había dejado ahí.
    ...formatoDeTodo({ sheetId, filaAncla: bandaA.desde, alto: bandaA.alto, vista: VISTA.POR_PROVEEDOR }),
    ...formatoDeTodo({ sheetId, filaAncla: bandaB.desde, alto: bandaB.alto, vista: VISTA.DETALLE }),
    // Ninguna fila del cuadro puede quedar oculta: siete lo estuvieron y el total cerraba igual.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: iA, endIndex: finIdx },
      properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const dif = diferenciasDeHuella(huellaAntes, huellaProtegida(despues, { ...geo, ancho: 7 }))
  if (dif.length) {
    console.error(`\n✗✗ SALIÓ DE SU RANGO — ${dif.length} celda(s) protegidas cambiaron:`)
    for (const d of dif.slice(0, 20)) console.error(`   ${d.dir}: "${d.antes}" → "${d.despues}"`)
    process.exitCode = 1
    return
  }
  console.log('✓ ni una celda protegida cambió (columna H y sección 2, verificadas releyendo)')

  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaEncabezado}:G${geo.filaLimite - 1}`)

  // La banda de formato ya tolera que la dinámica emita de más; la POSICIÓN del cuadro B todavía
  // sale de la estimación. Si la deriva se come el aire, el subtítulo cae adentro del cuadro A y
  // Google se niega a renderizar. Se cuenta releyendo, no se supone.
  const emitidoA = altoEmitido(leido ?? [])
  if (emitidoA !== plan.altoA) {
    const libres = plan.iSub - plan.iA - emitidoA
    const aviso = `el cuadro A emitió ${emitidoA} filas y se habían estimado ${plan.altoA}`
      + ` · ${libres} fila(s) de aire antes del subtítulo (formateadas igual: la banda cubre el footprint)`
    if (libres < 0) { console.error(`✗ ${aviso}`); process.exitCode = 1 } else console.log(aviso)
  }

  // LA EVIDENCIA DE QUE QUEDARON DOS Y NO TRES. Un #REF! en el cuadro de arriba no se ve leyendo
  // valores —la celda dice "#REF!" y listo—; lo que lo delata es contar los anclajes.
  const gridFinal = await google.getGridData(ID, `${PESTAÑA}!A1:A${geo.filaLimite}`)
  const anclas = (gridFinal?.sheets?.[0]?.data?.[0]?.rowData ?? [])
    .map((r, i) => (r?.values?.[0]?.pivotTable ? i + 1 : -1)).filter((i) => i > 0)
  if (anclas.length === 2 && anclas[0] === iA + 1 && anclas[1] === iB + 1) {
    console.log(`✓ dos dinámicas y sólo dos, en las filas ${anclas.join(' y ')}`)
  } else {
    console.error(`✗✗ hay ${anclas.length} dinámica(s) en las filas ${anclas.join(', ')}; se esperaban 2 (${iA + 1} y ${iB + 1})`)
    process.exitCode = 1
  }
  const rotos = (leido ?? []).flat().filter((c) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(c ?? '')))
  if (rotos.length) { console.error(`✗✗ ${rotos.length} celda(s) con error: ${[...new Set(rotos)].join(' · ')}`); process.exitCode = 1 }

  await recortarElAire({ google, sheetId, geo })

  console.log('\nLEÍDO DEL ARCHIVO:')
  for (const f of leido ?? []) {
    const t = (f ?? []).map((c) => String(c ?? '')).join(' | ')
    console.log('  ' + (t.replace(/[| ]/g, '') ? t.slice(0, 104) : '·'))
  }
}

/**
 * DEVOLVER EL AIRE QUE SOBRÓ ENTRE ESTA SECCIÓN Y LA 2.
 *
 * POR QUÉ (04/08). El dueño: entre las dos secciones había un agujero de filas vacías que se lee
 * como un error de la pestaña. El colchón tiene una razón legítima —una dinámica que no entra NO se
 * renderiza y deja la sección invisible— pero reservar con holgura y dejarlo puesto convierte una
 * precaución en un defecto visible.
 *
 * La reserva se hace ANTES de escribir, cuando todavía no se sabe cuánto va a emitir la dinámica; la
 * devolución se hace DESPUÉS, cuando ya se puede medir. La capacidad de crecer no se pierde: las
 * filas que quedan absorben el crecimiento chico sin correr nada, y cuando no alcanzan este mismo
 * script vuelve a insertar. Lo que se pierde es el agujero.
 *
 * Se mide anclado al TÍTULO de la sección 2 —texto real de otro dueño— y mirando el ancho ENTERO:
 * borrar una fila no tiene vuelta, y ya pasó que un generador que se creyó dueño hasta su última
 * columna le borrara al dueño catorce fechas que vivían más a la derecha. Ver `lib/proveedores-colchon.mjs`.
 */
async function recortarElAire({ google, sheetId, geo }) {
  const ancho = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}${geo.filaLimite + 20}`, { render: 'FORMULA' })
  const siguiente = filaDelSiguienteTitulo(ancho, geo.filaEncabezado)
  const s = sobranteDeColchon({ filas: ancho, desde: geo.filaEncabezado, hasta: siguiente })
  const sucias = filasNoVacias(ancho, s)
  if (s.sobrante && sucias.length) {
    console.error(`✗ NO recorto: las filas ${sucias.join(', ')} tienen datos — borrar no tiene vuelta`)
    return
  }
  if (!s.sobrante) {
    console.log(`${s.blancas} fila(s) de aire antes de la sección 2: no sobra nada (colchón ${COLCHON_FINAL})`)
    return
  }
  console.log(`${s.blancas} fila(s) de aire antes de la sección 2 → se devuelven ${s.sobrante}, quedan ${COLCHON_FINAL}`)
  await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: { range: {
    sheetId, dimension: 'ROWS', startIndex: s.desdeBorrar - 1, endIndex: s.hastaBorrar - 1 } } }], { espejo: true })

  // LA EVIDENCIA ES DEL EFECTO: se relee y se cuenta el aire que quedó de verdad.
  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}${geo.filaLimite + 20}`, { render: 'FORMULA' })
  const ahora = sobranteDeColchon({ filas: despues, desde: geo.filaEncabezado, hasta: filaDelSiguienteTitulo(despues, geo.filaEncabezado) })
  if (ahora.blancas === COLCHON_FINAL) console.log(`✓ quedaron ${ahora.blancas} filas de aire, releídas del archivo`)
  else { console.error(`✗✗ quedaron ${ahora.blancas} filas de aire y se esperaban ${COLCHON_FINAL}`); process.exitCode = 1 }
}

main().catch((e) => { console.error(e); process.exit(1) })
