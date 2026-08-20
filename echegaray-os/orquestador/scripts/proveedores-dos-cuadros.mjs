#!/usr/bin/env node
// LA SECCIÓN 1 DE PROVEEDORES, EN DOS TABLAS DINÁMICAS NATIVAS — CON EL PROVEEDOR COMO EJE.
//
// El pedido original (04/08): "necesito ver los totales de lo que le debo a cada proveedor y luego
// ver dentro cada operación". Una sola dinámica no puede: la API de Sheets NO emite el subtotal de
// un nivel externo —sólo el gran total del pie—, y está medido contra el archivo real con dos y con
// seis niveles. `showTotals: true` en el nivel de arriba no produce la fila "Alumetal · total".
//
// ═══ EL EJE SE MOVIÓ A LA FECHA Y EL DUEÑO LO RECHAZÓ EL MISMO DÍA (14/08) ═══
//
// A la mañana: *"aun tengo q seguir usando algunos filtros en pestaña compras para saber exactamente
// a quienes y como debo pagar un determinado dia"*. Los dos cuadros pasaron a abrir por la fecha.
// A la tarde: *"roto proveedores, esta verga asi no sirve para nada, LA BASE SIEMPRE ES EL NOMBRE
// DEL PROVEEDOR, ademas de q tomaba mal columnas de compras … rehacer"*.
//
// Los dos pedidos no son excluyentes y tratarlos así costó tres cosas: el ranking "a quién le debo
// más", las doce notas del dueño (perdieron su ancla al irse los nombres de la columna A) y
// `proveedores-plan-vivo.mjs`, que exige "Proveedor" en la A. La forma que respeta los dos:
//
//   A · A QUIÉN SE LE DEBE — una línea POR PROVEEDOR, ordenada por lo que se le debe. Su vencimiento
//                            más próximo y su nota "Qué hacer" al lado, ancladas a SU NOMBRE.
//   B · CADA OPERACIÓN     — el detalle agrupado POR DÍA DE PAGO: qué sale cada día, a quién, por
//                            qué comprobante, para qué obra y con qué medio. El corte por día vive
//                            acá, que es donde se ejecuta un pago, no donde se mide una deuda.
//
// ═══ Y LO SEGUNDO QUE DIJO: "TOMABA MAL COLUMNAS DE COMPRAS" ═══
//
// Los dos cuadros suman `Compras!AL · Saldo pendiente (OS)`, que hasta hoy no la escribía ningún
// script: vivía tipeada en una celda, sin dueño, sin test y sin paso en el pipeline. Ahora la escribe
// `compras-saldo-pendiente.mjs` desde `lib/deuda-por-tramos.mjs` —la aritmética de los tres tramos de
// pago, donde un `Monto Parcial` NEGATIVO es lo que FALTA y no un pago— y corre ANTES que esto en
// `PASOS`. Esta sección no vuelve a hacer su propia cuenta: consume la única que hay.
//
// LO QUE ESTA SECCIÓN NO PUEDE CONTESTAR SOLA, y hay que decirlo: sale de Compras en estado
// "Pendiente", así que muestra lo que TODAVÍA SE DEBE. Un cheque o un echeq YA LIBRADO con fecha de
// pago futura es plata comprometida de ese día que puede estar marcada "Pagado" en Compras — ésa
// vive en "Cheques Emitidos", que tiene su propio calendario. Unir las dos en un solo calendario
// exige deduplicar factura contra instrumento y NO se hizo acá.
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
import { ANCHOS_PROVEEDORES } from '../lib/proveedores-frontera.mjs'
import { leerParaDecidirBorrado } from '../lib/proveedores-lectura-dinamica.mjs'
import { SECCIONES_DINAMICAS, VALORES_DETALLE } from '../lib/proveedores-titulos.mjs'
import {
  altoEmitido, bandasDeFormato, COL, formatoDeTodo, fuenteCompras, geometriaDeLaSeccion,
  diasDePago, letraDeLaDeuda, PENDIENTE, pivotSeccion1, rotulosDelCuadro, VISTA,
} from '../lib/proveedores-pivot-seccion1.mjs'
import {
  colNota, colVence, rangoDelCuadroA, requestsDelCuadroA, reservaDelCuadroA, rotulosDelCuadroA,
  ROTULOS_A_LA_DERECHA,
} from '../lib/proveedores-cuadro-a.mjs'
import { requestsDeRotulos, rotulosQueNoEntran } from '../lib/proveedores-rotulos.mjs'
import { formulaControl, rangosCompras } from '../lib/proveedores-deuda-viva.mjs'
import { rangosDesdeEncabezado } from '../lib/proveedores-bloque-vivo.mjs'
import { ALERTA } from '../lib/glifos.mjs'

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

/** Los `name` de los valores del cuadro A. Los declara `proveedores-titulos.mjs` porque el
 *  sembrador de títulos reconoce la sección por ellos: dos copias es cómo se desincronizan. */
const VALORES = SECCIONES_DINAMICAS.find((s) => s.clave === 'deuda').valores

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

// ═══ LOS DOS CUADROS SALEN DE `pivotSeccion1`, NO SE ARMAN ACÁ (14/08) ═══
//
// Estaban escritos dos veces: la lib declaraba `camposDeFila`/`valoresDelPivot` y este script volvía
// a tipear el mismo objeto. Los formatos (`formatoDeTodo`, `formatoDeLaFecha`, `columnaDeLaDeuda`)
// CALCULAN la posición de cada columna desde la lib, así que dos declaraciones distintas del mismo
// pivot significan formato apuntado a la columna de al lado. Ya pasó con la fecha saliendo `46238`.
//
// A · A QUIÉN SE LE DEBE — una línea por proveedor, ordenada por lo que se le debe (el ranking).
// B · CADA OPERACIÓN     — el detalle, agrupado por día de pago: a quién, por qué comprobante, con
//                          qué medio, para qué obra.
const cuadroTotales = (fuente) => pivotSeccion1(fuente, { vista: VISTA.POR_PROVEEDOR, nombres: [...VALORES] })

const cuadroDetalle = (fuente) => pivotSeccion1(fuente, { vista: VISTA.DETALLE })

const texto = (sheetId, fila, valor, bold = false) => ({ updateCells: {
  range: { sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: 0, endColumnIndex: 1 },
  rows: [{ values: [{ userEnteredValue: { stringValue: valor }, userEnteredFormat: { textFormat: { bold } } }] }],
  fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // LOS RÓTULOS DE LOS CAMPOS DE FILA SON LOS ENCABEZADOS DE COMPRAS: la API no deja renombrarlos y
  // Compras es fuente, no se edita. Se leen para poder darle a la fila de rótulos el alto que hace
  // falta — "Fecha prevista de pago (día)" no entra de una línea en ninguna columna razonable.
  const cabecera = (await google.readSheetValues(ID, 'Compras!A3:AL3', { render: 'FORMATTED_VALUE' }))?.[0] ?? []
  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const pendientes = (compras ?? []).filter((f) => String(f?.[COL.estado] ?? '').trim() === PENDIENTE
    && String(f?.[COL.comercial] ?? '').trim() === '1')
  // LA RESERVA SE CUENTA COMO AGRUPA EL PIVOT —por el valor CRUDO— y con una fila de colchón: el
  // porqué, con su modo de falla, en `lib/proveedores-cuadro-a.mjs`.
  const proveedores = new Set(pendientes.map((f) => String(f?.[COL.proveedor] ?? '').trim())).size
  const reservaA = reservaDelCuadroA(pendientes)
  const anonimos = pendientes.filter((f) => String(f?.[COL.proveedor] ?? '').trim() === '')
  const total = pendientes.reduce((a, f) => a + (Number(f?.[COL.saldo]) || 0), 0)
  // EL CUADRO A ES UNA LÍNEA POR PROVEEDOR: el alto que hay que reservar sale de los proveedores
  // distintos, no de los días ni de las facturas. Contarlo con el criterio equivocado deja la última
  // fila con el formato de la corrida anterior — el `67797,51 | 31/12/1899` del 04/08.
  // Los días se siguen contando para AVISAR de las filas cuya fecha de pago no es una fecha: ésas
  // arman su propio grupo en el cuadro de detalle y son un pago que nadie ve venir.
  const { sinFecha } = diasDePago(pendientes)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const geo = geometriaDeLaSeccion(visible)

  // Dónde va cada cuadro y qué franja se formatea. El alto de un pivot es una ESTIMACIÓN y el
  // formato NO se mide con ella: las bandas cubren el footprint entero — ver `bandasDeFormato`.
  let plan = bandasDeFormato({ ...geo, gruposA: reservaA, facturas: pendientes.length })

  console.log(`PROVEEDORES ${proveedores} · FACTURAS ${pendientes.length} · TOTAL ${plata(total)}`
    + `   (se reservan ${reservaA} filas para el cuadro del eje)`)
  // Una deuda cuya fecha no es una fecha entra igual y arma su propio grupo: se dice ANTES de
  // escribir, con la plata que representa, porque es un pago que nadie va a ver venir en el calendario.
  for (const g of sinFecha) {
    console.log(`  ${ALERTA} ${g.filas} factura(s) por ${plata(g.saldo)} con "${g.valor}" donde va la fecha de pago`
      + ' — salen agrupadas bajo ese texto, no bajo un día. Se corrige en Compras.')
  }
  // ═══ UNA DEUDA SIN NOMBRE ES UN RÓTULO EN BLANCO EN LA COLUMNA A ═══
  //
  // Con el proveedor como eje vuelve a importar: el filtro del pivot es estado y comercial, NO exige
  // nombre, así que esa deuda entra igual —y tiene que entrar, la plata no se esconde— pero arma un
  // grupo sin rótulo, que es el agujero que el dueño reportó tres veces. No aborta: dejar la sección
  // congelada por una fila mal cargada es peor. Se grita antes de escribir.
  for (const f of anonimos) {
    console.log(`  ${ALERTA} deuda SIN NOMBRE de proveedor por ${plata(f?.[COL.saldo])}`
      + ` (comprobante ${String(f?.[COL.comprobante] ?? '').trim() || 'sin número'}) — va a salir como una fila`
      + ' en blanco en la columna A, y su nota y su vencimiento van a salir vacíos. Se completa en Compras.')
  }
  console.log(`A (a quién se le debe) ${plan.altoA} filas · B (cada operación) ${plan.altoB} filas`
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
    plan = bandasDeFormato({ ...geo, gruposA: reservaA, facturas: pendientes.length })
  }

  // La huella se toma DESPUÉS de insertar: si no, compara filas corridas y grita diferencias falsas.
  const base = faltan ? await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' }) : antes
  const huellaAntes = huellaProtegida(base, { ...geo, ancho: 7 })

  const { iA, iSub, iB, finIdx, bandaA, bandaB } = plan
  if (!(bandaA.alto > 0 && bandaB.alto > 0)) {
    throw new Error('el bloque no entra ni después de insertar filas: no formateo un rango vacío')
  }

  // LOS RÓTULOS DE CADA CUADRO, CALCULADOS ANTES DE ESCRIBIR. Si alguno no entra ni partido en dos
  // líneas se avisa: la regla de la pestaña es acortar el rótulo antes que ensanchar la columna, y
  // los de los campos de fila no se pueden acortar sin tocar Compras — así que hay que saberlo.
  // Los del cuadro A son CUATRO aunque el pivot escriba dos: las columnas "Vence" y "Qué hacer" son
  // fórmulas a su derecha, y si no entran al cálculo del alto, "Qué hacer" sale cortado y nadie se
  // entera hasta que el auditor de pantalla lo reporta.
  const rotulosA = rotulosDelCuadroA(cabecera, [...VALORES])
  const rotulosB = rotulosDelCuadro({ vista: VISTA.DETALLE, cabecera, nombresDeValores: [...VALORES_DETALLE] })
  for (const [nombre, rots] of [['A', rotulosA], ['B', rotulosB]]) {
    for (const r of rotulosQueNoEntran(rots, ANCHOS_PROVEEDORES)) {
      console.log(`⚠ cuadro ${nombre}: el rótulo "${r.texto}" necesita ${r.lineas} líneas en su columna`)
    }
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
    // EL CUERPO ARRANCA DEBAJO DEL RÓTULO: con la banda entera, "Se le debe" y "Facturas" quedaban
    // declaradas moneda y contador, y el auditor las reportaba como B17/C17/G32 en cada corrida.
    ...formatoDeTodo({ sheetId, filaAncla: plan.cuerpoA.desde, alto: plan.cuerpoA.alto, vista: VISTA.POR_PROVEEDOR }),
    ...formatoDeTodo({ sheetId, filaAncla: plan.cuerpoB.desde, alto: plan.cuerpoB.alto, vista: VISTA.DETALLE }),
    ...requestsDeRotulos({ sheetId, fila: plan.rotuloA, textos: rotulosA, anchos: ANCHOS_PROVEEDORES, derecha: ROTULOS_A_LA_DERECHA }),
    // En el detalle van a la derecha la fecha (0) y el importe (5), que son las dos columnas de
    // números. Decía `[2, 6]`: la 2 es el comprobante —texto— y la 6 era la columna de la nota, que
    // desde hoy no existe en este cuadro. Un rótulo alineado sobre una columna vacía es tinta.
    ...requestsDeRotulos({ sheetId, fila: plan.rotuloB, textos: rotulosB, anchos: ANCHOS_PROVEEDORES, derecha: [0, 5] }),
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
  // Con la fila de colchón deliberada, lo NORMAL es emitir una menos de las reservadas: eso deja dos
  // filas de aire antes del subtítulo en vez de una. Lo que no puede pasar nunca es que `libres` dé
  // negativo — ahí el subtítulo está adentro del cuadro y la dinámica de abajo no se renderiza.
  const emitidoA = altoEmitido(leido ?? [])
  const libres = plan.iSub - plan.iA - emitidoA
  const aviso = `el cuadro A emitió ${emitidoA} filas · se reservaron ${plan.altoA}`
    + ` · ${libres} fila(s) de aire antes del subtítulo (formateadas igual: la banda cubre el footprint)`
  if (libres < 0) {
    console.error(`✗ ${aviso} — el subtítulo cayó DENTRO del cuadro: la dinámica de abajo no se renderiza`)
    process.exitCode = 1
  } else if (emitidoA !== plan.altoA) console.log(aviso)

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
  await reponerLasColumnasQueEstaCorridaBorro({ google, sheetId, geo })

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
  // ═══ DOS LECTURAS FUSIONADAS, Y ES LO QUE MANTENÍA MUERTO AL CUADRO B (05/08) ═══
  //
  // Esta lectura era sólo `FORMULA`, que NO VE el cuerpo de una tabla dinámica. Lo último con algo
  // del bloque era entonces el subtítulo "Cada operación" —el cuadro B, 19 filas recién escritas,
  // no existía para la lectura— así que el recorte le devolvía al colchón las filas que el cuadro
  // acababa de ocupar, y el cinturón `filasNoVacias`, que usa la misma lectura, lo dejaba pasar.
  // Una dinámica sin lugar no se renderiza: Google la deja en #REF!, que es como estaba el cuadro B
  // en el archivo. El generador destruía su propio cuadro al final de cada corrida.
  // Ver `lib/proveedores-lectura-dinamica.mjs`.
  const rango = `${PESTAÑA}!A1:${ANCHO_LECTURA}${geo.filaLimite + 20}`
  const ancho = await leerParaDecidirBorrado({ google, id: ID, rango })
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
  const despues = await leerParaDecidirBorrado({ google, id: ID, rango })
  const ahora = sobranteDeColchon({ filas: despues, desde: geo.filaEncabezado, hasta: filaDelSiguienteTitulo(despues, geo.filaEncabezado) })
  if (ahora.blancas === COLCHON_FINAL) console.log(`✓ quedaron ${ahora.blancas} filas de aire, releídas del archivo`)
  else { console.error(`✗✗ quedaron ${ahora.blancas} filas de aire y se esperaban ${COLCHON_FINAL}`); process.exitCode = 1 }
}

/**
 * REPONER "VENCE" Y "QUÉ HACER" — LAS DOS COLUMNAS QUE ESTA MISMA CORRIDA ACABA DE BORRAR.
 *
 * ═══ EL DEFECTO, CON SU FECHA (14/08) ═══
 *
 * La limpieza de arriba vacía el rectángulo A:G de la sección para que ninguna dinámica vieja
 * sobreviva. La columna "Qué hacer" —las notas del dueño— vive DENTRO de ese rectángulo, y quien la
 * reponía era otro script, `proveedores-notas-visibles.mjs`, que sólo corre después dentro del
 * pipeline. Correr este generador solo, que es exactamente lo que su cabecera documenta, borró las
 * catorce notas y no avisó: la sección quedó completa a la vista, sin una celda en rojo, sin un
 * error en el log y sin una línea distinta en la salida.
 *
 * El dueño, ese día: *"rompiste todo proveedores y lo q yo te pedia era arreglar y mejorar todo lo
 * q habia, no romperlo y hacerlo desaparecer"*. Y ese mismo día se perdieron doce notas más (D17:D28)
 * al mudar el eje del cuadro: la búsqueda seguía viva, pero apuntada a una columna donde ya no había
 * nombres de proveedor, así que devolvía vacío en las doce. En silencio.
 *
 * ═══ LA REGLA QUE ESTO INSTALA: EL QUE BORRA REPONE, EN LA MISMA CORRIDA ═══
 *
 * No alcanza con documentar el orden de los pasos — el orden es una convención y las convenciones se
 * rompen corriendo un script suelto, que es lo que pasó. La única forma de que no dependa de quién
 * corre qué es que el script que vacía las columnas las deje puestas antes de terminar. Los requests
 * son los MISMOS que usa `proveedores-notas-visibles.mjs`: viven en `lib/proveedores-cuadro-a.mjs` y
 * `lib/proveedores-notas-columna.mjs` para que no puedan separarse.
 *
 * ═══ VA DESPUÉS DE `recortarElAire`, Y NO ES UN DETALLE ═══
 *
 * Una fórmula que devuelve "" se lee como fórmula, no como celda vacía. Escritas antes del recorte,
 * estas dos columnas taparían todo el aire del bloque y el colchón quedaría congelado — el agujero
 * entre secciones que el dueño ya reportó, esta vez sin forma de cerrarlo.
 *
 * NO consulta la base: la nota busca contra la pestaña auxiliar. Si Postgres está caído, vuelve igual.
 */
async function reponerLasColumnasQueEstaCorridaBorro({ google, sheetId, geo }) {
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  // Los dos anclajes son TEXTO de otro dueño, no la salida de la corrida anterior: un cuadro en #REF!
  // deja de reconocerse a sí mismo, y ahí es donde un generador se engancha en la fila equivocada.
  // Arriba, la fila de rótulos del cuadro A (que sale del contrato de la sección, ver `geo`); abajo,
  // el subtítulo del cuadro de detalle, que es el TOPE que estas dos columnas no pueden pasar.
  const iSub = (visible ?? []).findIndex((f, i) => i >= geo.filaEncabezado
    && /^cada operaci[oó]n/i.test(String(f?.[0] ?? '').trim()))
  if (iSub < 0) {
    console.error('  ✗ no encontré el subtítulo "Cada operación": NO repongo "Vence" ni "Qué hacer".'
      + '\n    → node orquestador/scripts/proveedores-notas-visibles.mjs --aplicar')
    process.exitCode = 1
    return
  }
  const r = rangoDelCuadroA({ visible, filaRotulos: geo.filaEncabezado, filaTope: iSub + 1 })
  const reqs = requestsDelCuadroA({ sheetId, filaRotulos: geo.filaEncabezado, ...r })
  if (!reqs.length) {
    console.error('  ✗ el cuadro "a quién se le debe" no tiene ni una fila entre sus rótulos y el'
      + ' detalle: NO repongo "Vence" ni "Qué hacer".')
    process.exitCode = 1
    return
  }
  await google.spreadsheetBatchUpdate(ID, [
    ...reqs,
    ...await requestsDelControl({ google, sheetId, geo, rango: r }),
  ], { espejo: true })

  // LA EVIDENCIA ES DEL EFECTO: se relee y se cuenta cuántas notas quedaron A LA VISTA. Que el batch
  // haya respondido 200 no prueba que una sola nota se vea.
  const cVence = colVence()
  const cNota = colNota()
  const L = String.fromCharCode(65 + cNota)
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${r.desde}:${L}${r.hasta - 1}`)
  const conProveedor = (leido ?? []).filter((f) => String(f?.[0] ?? '').trim() !== '')
  const conNota = conProveedor.filter((f) => String(f?.[cNota] ?? '').trim() !== '').length
  const conVence = conProveedor.filter((f) => String(f?.[cVence] ?? '').trim() !== '').length
  console.log(`✓ "Vence" y "Qué hacer" repuestas en ${String.fromCharCode(65 + cVence)}${r.desde}:${L}${r.hasta - 1}`
    + ` · ${conProveedor.length} proveedor(es) · ${conVence} con vencimiento · ${conNota} con nota,`
    + ' releídos del archivo')
  if (conNota === 0) {
    console.error('  ✗✗ ni una sola nota quedó visible. O la auxiliar _PROVEEDORES_OS está vacía'
      + ' (la escribe proveedores-cuenta-corriente.mjs) o el cuadro no emitió proveedores.')
    process.exitCode = 1
  }
}

/**
 * EL CONTROL DE LA SECCIÓN, APUNTADO A LA COLUMNA DONDE QUEDÓ LA DEUDA.
 *
 * Arriba de los rótulos vive una celda que compara lo que muestra el cuadro contra el titular del
 * encabezado. Sumaba la columna del cuadro de fórmulas viejo; cada vez que el cuadro cambió de forma
 * quedó apuntando una columna más allá — y un control que mira la columna equivocada no avisa de
 * menos: avisa cualquier cosa. Ya pasó: gritó "falta $15.716.930" (el total entero) porque sumaba
 * una columna de texto.
 *
 * Se reapunta a la columna de la deuda del cuadro que ABRE la sección (la B), sobre el rango REAL
 * medido releyendo —colchón incluido, para que un proveedor nuevo entre solo—. Se toca únicamente el
 * `SUM($X$n:$X$m)`: el resto de la fórmula del dueño queda intacto.
 *
 * Si la celda no está, se avisa y se sigue: sin control la sección se lee igual, sin cuadro no.
 *
 * @param {{google:object, sheetId:number, geo:object, rango:{desde:number, hasta:number}}} o
 * @returns {Promise<object[]>}
 */
async function requestsDelControl({ google, sheetId, geo, rango }) {
  const filaControl = geo.filaEncabezado - 1
  if (filaControl < 1) return []
  const celda = `${PESTAÑA}!A${filaControl}`
  const vieja = String((await google.readSheetValues(ID, celda, { render: 'FORMULA' }))?.[0]?.[0] ?? '')
  if (!/^=/.test(vieja) || !/SUM\(/.test(vieja)) {
    console.log(`  ⚠ A${filaControl} no tiene el control de la sección (${vieja.slice(0, 40) || 'vacía'}): no lo toco`)
    return []
  }
  const columna = letraDeLaDeuda()

  // ═══ SE REGENERA, NO SE PARCHEA (19/08/2026) ═══
  //
  // Acá vivía un `reapuntarControl(vieja, …)` que tocaba ÚNICAMENTE el `SUM($X$n:$X$m)` y dejaba
  // intacto el resto de la fórmula. Sonaba prudente —"no reescribo lo que no cambió"— y fue el
  // escondite perfecto para un defecto de fondo: el cuerpo de la fórmula, los SUMIFS contra Compras,
  // NUNCA se regeneraba. Cuando la definición de «lo que se debe» se corrigió en el repositorio, la
  // celda del archivo siguió con la vieja, restando también `Monto Parcial 1`. Resultado: el control
  // del pie contradecía por $136.000 al cuadro que tenía justo arriba, los dos "bien" según su propia
  // aritmética, y el dueño leyéndolo —con razón— como *"no lee bien de compras"*.
  //
  // Una fórmula que sólo se parchea no puede recibir una corrección de criterio. Ahora se escribe
  // entera desde `formulaControl()`, que a su vez sale de la resta canónica: si mañana cambia qué
  // cuenta como pago, cambia en un archivo y baja sola a la pestaña en la corrida siguiente.
  const cabecera = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { rangos: crudos, avisos } = rangosDesdeEncabezado(cabecera)
  for (const a of avisos) console.warn(`  ⚠ ${a}`)
  const nueva = formulaControl({
    rangos: rangosCompras(crudos),
    rangoSaldo: `$${columna}$${rango.desde}:$${columna}$${rango.hasta - 1}`,
    que: 'el detalle',
  })
  if (nueva === vieja) {
    console.log(`  ○ el control de A${filaControl} ya estaba al día (suma ${columna}${rango.desde}:${columna}${rango.hasta - 1})`)
    return []
  }
  // Se dice qué cambió, no sólo que cambió: si además del rango cambió el CRITERIO, eso es noticia.
  const cambioCriterio = vieja.replace(/SUM\(\$[A-Z]{1,3}\$\d+:\$[A-Z]{1,3}\$\d+\)/, '')
    !== nueva.replace(/SUM\(\$[A-Z]{1,3}\$\d+:\$[A-Z]{1,3}\$\d+\)/, '')
  console.log(`  CONTROL A${filaControl} → SUM(${columna}${rango.desde}:${columna}${rango.hasta - 1})`
    + (cambioCriterio ? '  ⟵ y con el criterio de deuda REGENERADO desde la definición canónica' : ''))
  return [{ updateCells: {
    range: { sheetId, startRowIndex: filaControl - 1, endRowIndex: filaControl, startColumnIndex: 0, endColumnIndex: 1 },
    rows: [{ values: [{ userEnteredValue: { formulaValue: nueva } }] }], fields: 'userEnteredValue' } }]
}

main().catch((e) => { console.error(e); process.exit(1) })
