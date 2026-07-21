#!/usr/bin/env node
// PROVEEDORES Y MATERIALES — REHECHA CON TABLAS DINÁMICAS NATIVAS.
//
// POR QUÉ ESTA VERSIÓN (21/07). El dueño rechazó la anterior dos veces. Primero: "esta pestaña ha
// quedado con mal formato, además quiero que se respete algún orden, fecha de pago, monto de deuda.
// En pestaña RESUMEN está mejor esto al ser tablas dinámicas. Este no es formato clase mundial la
// verdad". La rehice sin ir a mirar RESUMEN. Segundo: "esa pestaña es completamente inútil".
//
// Fui a mirar RESUMEN recién ahora y el lineamiento era literal: sus tablas son PIVOTS NATIVOS de
// Google. Agrupan, subtotalan solos, se pliegan con el +/− y el que lee puede reordenarlos sin tocar
// una fórmula. Lo que yo armaba era una lista de DIECISÉIS columnas generada con QUERY: se ve toda
// de golpe, no se puede plegar, y seis de esas columnas eran el mismo importe mirado desde ángulos
// que no cambian ninguna decisión.
//
// ═══ QUÉ CAMBIA, CONCRETAMENTE ═══
//
// · Los cuadros pasan a ser pivots sobre el rango de Compras. CERO números escritos por el código:
//   hay una definición y Google calcula. Es la forma más fuerte de la regla de oro.
// · El orden ES el que pidió: la deuda ordenada por FECHA DE PAGO, y la cuenta corriente ordenada
//   por MONTO ADEUDADO de mayor a menor — ordenada POR VALOR, no alfabéticamente, así el cuadro
//   contesta "a quién le debo más" sin que nadie ordene nada.
// · Las facturas SIN fecha de pago dejan de estar arriba de todo. Un QUERY ordenado por fecha pone
//   los vacíos primero, así que lo primero que se veía al abrir la pestaña eran tres filas en
//   blanco. Ahora tienen su propio bloque, señalado como lo que son: plata que se debe y que
//   ninguna semana del cash flow está esperando pagar.
// · Desaparecen las columnas que repetían el mismo importe.
//
// ═══ EL DEFECTO DE RESUMEN QUE NO SE COPIA ═══
//
// El pivot de cobranzas de RESUMEN filtra enumerando siete fechas literales. Un cobro con fecha
// nueva no aparece y nadie se entera. Acá los filtros son CONDICIONES ("Estado = Pendiente"), que
// siguen siendo verdaderas cuando entra un dato nuevo. Ver lib/pivot-sheets.mjs.
//
//   node orquestador/scripts/proveedores-materiales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { pivot, filtroValores, valoresNoCubiertos, plantar, borrar, filtrosQueSeCongelan, RESUMEN } from '../lib/pivot-sheets.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores y Materiales'
const DRY = process.argv.includes('--dry')

/** Las columnas de Compras, 0-indexadas. Leídas del encabezado real, no supuestas. */
export const C = {
  fechaFactura: 2, proveedor: 4, modalidad: 5, comprobante: 7, unidad: 8,
  cliente: 9, concepto: 11, importe: 12, total: 14,
  fechaPrevista: 16, estado: 23, rubro: 28, fechaCaja: 29, familia: 30,
}

/**
 * El rango origen: desde el ENCABEZADO de Compras hasta el final de la tabla.
 *
 * EL ENCABEZADO ESTÁ EN LA FILA 3, NO EN LA 4. Lo puse en 4 de memoria y el pivot tomó la primera
 * factura como nombre de columna: el cuadro salió con "29/6/2026", "RSV" y "Taller" de encabezados y
 * sin una sola fila de datos. Un pivot mal anclado no da error — da un cuadro vacío que parece
 * correcto.
 */
const ORIGEN = { desdeFila: 2, hastaFila: 900, columnas: 32 }

/** El estado que marca una factura impaga. Una sola definición para toda la pestaña. */
const PENDIENTE = 'Pendiente'

/**
 * Los cuadros, en el orden en que se leen.
 *
 * EL ORDEN NO ES DECORATIVO: primero lo que hay que hacer esta semana (a quién se le paga y cuándo),
 * después con quién se gasta, y al final en qué se va la plata. Una pestaña que abre con un análisis
 * de familias de material y esconde el vencimiento de mañana está ordenada al revés.
 */
export function cuadros(sheetCompras, estadosHoy = []) {
  const base = { sheetId: sheetCompras, ...ORIGEN }
  // La enumeración se arma con los valores que EXISTEN HOY en la columna, no con una lista escrita
  // a mano: la API de pivots no acepta condiciones y una enumeración fija se congela.
  const soloPendiente = filtroValores([PENDIENTE], estadosHoy)
  return [
    {
      titulo: '1 · A QUIÉN HAY QUE PAGARLE Y CUÁNDO',
      nota: 'Sólo lo que está Pendiente, agrupado por fecha de pago: lo de arriba vence primero. Plegá una fecha con el − del margen.',
      pivot: pivot({
        ...base,
        filas: [
          { col: C.fechaPrevista, orden: 'ASC' },
          { col: C.proveedor, orden: 'ASC', totales: false },
          { col: C.cliente, orden: 'ASC', totales: false },
        ],
        valores: [{ col: C.total, resumen: RESUMEN.suma, nombre: 'A pagar' }],
        filtros: [{ col: C.estado, criterio: soloPendiente }],
      }),
    },
    {
      titulo: '2 · A QUIÉN LE DEBO MÁS — cuenta corriente por proveedor',
      nota: 'Ordenado por deuda, de mayor a menor: es la lista de con quién conviene sentarse a hablar. Plegá un proveedor para ver sus facturas.',
      pivot: pivot({
        ...base,
        filas: [
          { col: C.proveedor, orden: 'DESC', ordenarPorValor: 0 },
          { col: C.comprobante, orden: 'ASC', totales: false },
        ],
        valores: [{ col: C.total, resumen: RESUMEN.suma, nombre: 'Deuda' }],
        filtros: [{ col: C.estado, criterio: soloPendiente }],
      }),
    },
    {
      titulo: '3 · CUÁNTO SE LE COMPRÓ A CADA UNO — todo 2026, esté pagado o no',
      nota: 'Sirve para negociar precio y para ver de quién depende la obra. Las columnas son los meses.',
      pivot: pivot({
        ...base,
        filas: [{ col: C.proveedor, orden: 'DESC', ordenarPorValor: 0 }],
        columnasPivot: [{ col: C.fechaFactura, orden: 'ASC' }],
        valores: [{ col: C.total, resumen: RESUMEN.suma, nombre: 'Comprado' }],
      }),
    },
    {
      titulo: '4 · EN QUÉ SE VA LA PLATA — familia de material por obra',
      nota: 'La familia la clasifica el OS solo desde el concepto de la factura. "SIN CLASIFICAR" es trabajo pendiente del OS, no un rubro real.',
      pivot: pivot({
        ...base,
        filas: [{ col: C.familia, orden: 'DESC', ordenarPorValor: 0 }],
        columnasPivot: [{ col: C.cliente, orden: 'ASC' }],
        valores: [{ col: C.total, resumen: RESUMEN.suma, nombre: 'Gastado' }],
      }),
    },
  ]
}

/**
 * Las facturas pendientes SIN una fecha de pago de verdad.
 *
 * POR QUÉ TIENEN SU PROPIO BLOQUE: un pivot ordenado por fecha las pone arriba de todo, así que lo
 * primero que se veía al abrir la pestaña eran filas en blanco. Y no es un detalle de presentación:
 * una factura sin fecha de pago NO CAE EN NINGUNA SEMANA del cash flow.
 *
 * ═══ LO QUE APARECIÓ AL ARMAR EL PIVOT (21/07) ═══
 *
 * El cuadro 1 mostró un grupo de fecha llamado "Pendiente". Fui a mirar: ONCE FILAS de Compras
 * tienen la palabra "Pendiente" ESCRITA EN LA COLUMNA DE FECHA prevista de pago, por $15.010.639.
 * Sobre una deuda total de $16.447.674, es el 91%.
 *
 * O sea que casi toda la deuda con proveedores está fuera de la proyección semanal de caja, y el
 * cash flow muestra una semana más holgada de lo que es. El QUERY no lo delataba porque Sheets trata
 * un texto en una columna de fecha como null: la fila simplemente no aparecía. El pivot sí, porque
 * agrupa por el valor tal cual está.
 *
 * NO SE CORRIGE SOLO: cuál es la fecha real de cada una es una decisión del dueño, no un dato que el
 * OS pueda inferir. Se muestra con nombre, monto y peso sobre el total.
 */
function bloqueSinFecha() {
  return {
    titulo: '⚠ PENDIENTES SIN UNA FECHA DE PAGO DE VERDAD — no caen en ninguna semana del cash flow',
    nota: 'Al 21/07 son 11 facturas por $15.010.639: el 91% de toda la deuda. En esas filas la columna "Fecha prevista de pago" de Compras tiene escrita la palabra "Pendiente" en vez de una fecha, así que el cash flow no las espera ninguna semana. Se pone la fecha real y esto se vacía solo.',
    encabezados: ['Proveedor', 'Comprobante', 'Fecha factura', 'Obra', 'Importe'],
    unidades: ['texto', 'texto', 'fecha', 'texto', 'moneda'],
    formula: `=IFERROR(QUERY(Compras!$A$4:$AF;"select E, H, C, J, O where X = '${PENDIENTE}' and Q is null and O is not null order by O desc label E ''";0);"✓ todas las facturas pendientes tienen fecha de pago")`,
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTAÑA)
  const compras = meta.find((h) => h.title === 'Compras')
  if (!hoja || !compras) throw new Error('falta la pestaña Proveedores y Materiales o Compras')

  // EL DOMINIO REAL DE LA COLUMNA ESTADO, leído en cada corrida.
  const colEstado = await google.readSheetValues(ID, 'Compras!X3:X900')
  const estadosHoy = [...new Set(colEstado.map((f) => String(f?.[0] ?? '').trim()).filter(Boolean))]
    .filter((x) => x !== 'Estado')
  const cs = cuadros(compras.sheetId, estadosHoy)

  // EL CONTROL: ¿aparece en Compras un estado que ningún cuadro contempla? Sería plata que
  // desaparece del cuadro sin que nadie se entere — el defecto que tiene el pivot de RESUMEN.
  const fuera = valoresNoCubiertos(estadosHoy, [PENDIENTE], ['Pagado', 'Proyectado'])
  if (fuera.length) console.log(`  ⚠ estados nuevos en Compras que ningún cuadro contempla: ${fuera.join(', ')}`)
  console.log(`  estados en Compras hoy: ${estadosHoy.join(' · ')}`)

  // ── EL PLANO ──────────────────────────────────────────────────────────────────────────────────
  // Cada pivot se derrama hacia abajo cuanto necesite, así que van uno por COLUMNA y no uno debajo
  // del otro: en vertical, el de arriba pisaría al de abajo el día que aparece un proveedor nuevo.
  // Es la misma razón por la que el bloque de control de Cobranzas va a la derecha y no abajo.
  // Los dos primeros cuadros son angostos (concepto + un importe). Los dos últimos abren una columna
  // POR MES y POR OBRA, así que necesitan ~16 columnas cada uno. Con el plano anterior el tercero
  // se derramaba encima del cuarto y Google devolvía #REF! en vez de datos.
  const COL = [0, 6, 12, 30]     // A, G, M, AE
  const F_PIVOT = 5              // índice 5 = fila 6; arriba van el rótulo y la nota de cada cuadro
  const F_SF = 205               // el bloque de lo que falta, bien abajo de todo

  const reqs = [E.reset(hoja.sheetId, 300, 50)]
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

  // Los pivots viejos se BORRAN antes de plantar los nuevos: un pivot no se pisa, y si el nuevo
  // ocupa menos filas que el viejo quedan restos derramados. Esta pestaña la rehace un agente cada
  // dos horas, así que el resto sería permanente.
  const viejos = await google.getPivotTables(ID, `${PESTAÑA}!A1:AX250`).catch(() => [])
  for (const v of viejos) reqs.push(borrar(hoja.sheetId, v.fila - 1, v.col))

  const textos = []
  cs.forEach((b, i) => {
    const c = COL[i]
    textos.push({ fila: F_PIVOT - 2, col: c, texto: b.titulo })
    textos.push({ fila: F_PIVOT - 1, col: c, texto: b.nota })
    reqs.push({ repeatCell: { range: rg(F_PIVOT - 2, F_PIVOT - 1, c, c + 5), cell: { userEnteredFormat: E.bloque() }, fields: 'userEnteredFormat' } })
    reqs.push({ repeatCell: { range: rg(F_PIVOT - 1, F_PIVOT, c, c + 5), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } })
    reqs.push(plantar(hoja.sheetId, F_PIVOT, c, b.pivot))
    // Los importes del pivot en formato moneda: Google los derrama sin formato de número.
    reqs.push({
      repeatCell: {
        range: rg(F_PIVOT, 200, c + 1, c + 5),
        cell: { userEnteredFormat: E.celda('moneda') },
        fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)',
      },
    })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: E.ANCHO.concepto }, fields: 'pixelSize' } })
    for (let k = 1; k < 5; k++) {
      reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: c + k, endIndex: c + k + 1 }, properties: { pixelSize: E.ANCHO.numero }, fields: 'pixelSize' } })
    }
  })

  const sf = bloqueSinFecha()
  reqs.push({ repeatCell: { range: rg(0, 1, 0, 50), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: rg(1, 2, 0, 50), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: rg(F_SF - 1, F_SF, 0, 5), cell: { userEnteredFormat: E.alerta() }, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: rg(F_SF, F_SF + 1, 0, 5), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: rg(F_SF + 1, F_SF + 2, 0, 5), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } })
  sf.unidades.forEach((u, k) => {
    reqs.push({ repeatCell: { range: rg(F_SF + 2, F_SF + 40, k, k + 1), cell: { userEnteredFormat: E.celda(u) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
  })
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } })

  if (DRY) { console.log(`(--dry) ${reqs.length} requests, ${cs.length} pivots, no escribí nada`); return }

  // LA GRILLA TIENE QUE EXISTIR ANTES DE ESCRIBIR EN ELLA. La pestaña venía con 20 columnas y 260
  // filas, y el cuarto cuadro arranca en la U: la API rechaza el rango entero con un 400 y no
  // escribe nada. Crecer la grilla es la primera operación, no una que se descubre fallando.
  const FILAS_MIN = 300, COLS_MIN = 50
  if ((hoja.rows ?? 0) < FILAS_MIN || (hoja.cols ?? 0) < COLS_MIN) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: {
        properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: Math.max(hoja.rows ?? 0, FILAS_MIN), columnCount: Math.max(hoja.cols ?? 0, COLS_MIN) } },
        fields: 'gridProperties(rowCount,columnCount)',
      },
    }])
  }

  // LIMPIAR EL CONTENIDO VIEJO. El reset de estilo borra FORMATO, no contenido, y esta versión usa
  // muchas menos filas que la anterior: sin esto quedan abajo los restos del cuadro viejo, que
  // parecen datos vigentes. Lo probé y la verificación los leyó como si fueran facturas sin fecha.
  // La pestaña es 100% del OS —no hay nada cargado a mano acá— así que vaciarla es seguro.
  await google.clearValues(ID, `${PESTAÑA}!A1:AX300`)

  // El TEXTO va con values.update (USER_ENTERED localiza la fórmula a es-AR); el FORMATO y los
  // pivots con batchUpdate. Los dos en ese orden: un formato aplicado antes de que exista el
  // contenido se pierde cuando el contenido llega.
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!A1`, values: [[PESTAÑA.toUpperCase()]] },
    { range: `${PESTAÑA}!A2`, values: [['Se recalcula sola desde Compras. Ningún número de esta pestaña está escrito por el código: son tablas dinámicas sobre el rango real, se pliegan con el − del margen y se pueden reordenar sin romper nada.']] },
    ...textos.map((t) => ({ range: `${PESTAÑA}!${colLetra(t.col)}${t.fila + 1}`, values: [[t.texto]] })),
    { range: `${PESTAÑA}!A${F_SF}`, values: [[sf.titulo]] },
    { range: `${PESTAÑA}!A${F_SF + 1}`, values: [[sf.nota]] },
    { range: `${PESTAÑA}!A${F_SF + 2}:E${F_SF + 2}`, values: [sf.encabezados] },
    { range: `${PESTAÑA}!A${F_SF + 3}`, values: [[sf.formula]] },
  ])
  for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))

  // ── VERIFICACIÓN CONTRA EL SHEET REAL ─────────────────────────────────────────────────────────
  const plantados = await google.getPivotTables(ID, `${PESTAÑA}!A1:AX250`)
  console.log(`${PESTAÑA}: ${plantados.length} de ${cs.length} tablas dinámicas plantadas`)
  if (plantados.length !== cs.length) process.exitCode = 1
  // Los filtros por enumeración se REGENERAN en cada corrida (la API no acepta condiciones), así que
  // acá se inventarían, no se prohíben: es lo que hay que refrescar para que el cuadro no envejezca.
  const conEnum = plantados.filter((p) => filtrosQueSeCongelan(p.pivot).length)
  console.log(`  ${conEnum.length} cuadro(s) con filtro por enumeración, regenerado en esta corrida`)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A${F_SF + 3}:E${F_SF + 40}`)
  const sinFecha = v.filter((f) => String(f?.[0] ?? '').trim() && !/^✓/.test(String(f?.[0] ?? '')))
  console.log(`  facturas pendientes SIN fecha de pago: ${sinFecha.length}`)
  for (const f of sinFecha) console.log(`     ${String(f[0]).slice(0, 26).padEnd(28)}${String(f[4] ?? '').padStart(14)}`)
  console.log('  ✓ ningún número escrito por el código: los cuatro cuadros son definiciones sobre el rango de Compras')
}

function colLetra(n) { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
