#!/usr/bin/env node
// "Cheques Emitidos" — ESCRIBE LA BANDA DE ARRIBA. EL REGISTRO NO SE TOCA.
//
//        DE LO QUE FIRMÉ, ¿CUÁNTO TODAVÍA NO SALIÓ Y CUÁNDO SALE?
//
// La grilla, las fórmulas y las reglas de color viven en `lib/cheques-emitidos-cabecera.mjs` y se
// prueban en frío. Acá está sólo lo que necesita hablar con Google: ubicar el registro, ajustar el
// alto de la banda, escribir, formatear y VERIFICAR LEYENDO EL DESTINO.
//
// ═══ REGLAS QUE ESTE SCRIPT NO PUEDE ROMPER ═══
//
//   · NO toca el registro (de la fila FILA_HDR en adelante): lo carga el dueño a mano.
//   · Ni un número pegado: la banda es TODA fórmula sobre el propio registro. La única cifra que
//     viene de afuera —la plata disponible— se referencia a CAJA por RANGO CON NOMBRE.
//   · El ancla es el DATO (FISICO/ECHEQ en la columna A), no un rótulo que una persona pueda borrar.
//     Si no aparece, ABORTA: insertar filas a ciegas deja la pestaña con dos bandas superpuestas.
//   · Ninguna celda de la banda dice "SI" en la columna K ni lleva la marca de cobertura en la M.
//     Ver la cabecera de lib/cheques-emitidos-cabecera.mjs: es el contrato con CAJA!B14 y CAJA!H15.
//
// ═══ ESTA PESTAÑA SE ESCRIBE POR `updateCells`, DIRECCIONANDO POR sheetId (05/08) ═══
//
// `values.batchUpdate` sobre "Cheques Emitidos" contesta `totalUpdatedCells` con el `updatedRange`
// correcto y NO aterriza: la celda se queda con su contenido viejo. Verificado con las tres formas de
// lectura y releyendo diez segundos por si algo la revertía; las otras siete pestañas aceptan esa
// misma escritura. La causa sigue sin identificarse. Direccionar por `sheetId` sí aterriza.
//
//   node orquestador/scripts/cheques-emitidos-tablero.mjs [--dry] [--rediseniar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { abortaPorGeometria } from '../lib/propiedad-estructura.mjs'
import { loadConfig } from '../lib/config.mjs'
import { skinRequests, MUTED, INK, ACENTO, HAIR } from '../lib/estilo-statement.mjs'
import { conEdicionesRespetadas, guardarRegistro, autoRespetarReescritura } from '../lib/respetar-ediciones.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
import { BANDA, FILA_HDR } from '../lib/cheques-emitidos-geometria.mjs'
import {
  COLS, FILAS, COL_SELECTOR, SEMANAS, DIAS, SELECTOR_DEFECTO,
  bandaFilas, selectorAConservar, validacionDelSelector, reglasDelCalendario, indicesPropios,
} from '../lib/cheques-emitidos-cabecera.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Cheques Emitidos'
const DRY = process.argv.includes('--dry')

/**
 * NÚCLEO PURO: dónde arranca el registro. Se ancla en el DATO (FISICO/ECHEQ en la columna A), no en
 * un rótulo: el dueño ya borró la columna de rótulos una vez y el generador insertó 12 filas a
 * ciegas, dejando la pestaña con dos bandas superpuestas.
 * @returns {{primera:number, hdr:number}|null} filas 1-based, o null si no encuentra el registro
 */
export function ubicarRegistro(colA = []) {
  const i = colA.findIndex((f) => /^(FISICO|ECHEQ)$/i.test(String(f?.[0] ?? '').trim()))
  if (i < 0) return null
  return { primera: i + 1, hdr: i } // hdr = la fila del encabezado, justo arriba del primer dato
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTANA)
  if (!hoja) { console.error(`No existe la pestaña ${PESTANA}`); process.exit(1) }
  const sheetId = hoja.sheetId

  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA (31/07). Con `.catch(() => [])` un 429 de la API se
  // convertía en "la pestaña está vacía": la Regla 0 daba TODOS mis rótulos por borrados por el dueño
  // y la fusión escribía encima de lo suyo. Si no se puede leer, no se puede decidir: falla cerrado.
  const previo = await google.readSheetValues(ID, `'${PESTANA}'!A1:M`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA}" (${e.message}). NO escribo: la fusión tomaría la pestaña por vacía y pisaría lo tuyo.`)
  })
  const ubic = ubicarRegistro(previo)
  if (!ubic) {
    console.error(`ABORTA: no encuentro el registro (ninguna fila con FISICO/ECHEQ en la columna A de ${PESTANA}).`)
    console.error('Sin ancla, insertar filas dejaría la pestaña con dos bandas. Revisar la pestaña a mano.')
    process.exit(1)
  }
  const bandaActual = ubic.hdr - 1 // filas de banda hoy (el encabezado del registro no cuenta)

  const selector = await leerSelector(google, bandaActual)
  const filas = bandaFilas({ selector })

  if (DRY) {
    console.log(`(--dry) banda ${bandaActual} → ${BANDA} filas · encabezado del registro: ${ubic.hdr} → ${FILA_HDR}`)
    console.log(`(--dry) selector de mes: ${JSON.stringify(selector)}`)
    filas.forEach((f, i) => console.log(String(i + 1).padStart(3),
      f.filter((c) => c !== '').slice(0, 3).map((c) => String(c).slice(0, 70)).join('  |  ')))
    return
  }

  const firma = await firmaGuardia(google, ID, PESTANA, `'${PESTANA}'`)
  if (firma.editada) {
    console.log(`  ✋ NO escribo: la firma dice que "${PESTANA}" la editaste vos${firma.motivo ? ` (${firma.motivo})` : ''}.`)
    console.log('     Lo que hay en la pestaña es tuyo y se queda. Si querés que la rehaga, decímelo.')
    return
  }

  // ═══ LA PUERTA DEL REDISEÑO AUTORIZADO ═══
  // `autoRespetarReescritura` compara los rótulos que este generador quiere escribir contra los que
  // hay en la pestaña, y si sobreviven pocos concluye —bien— que la reescribió una persona. Es la
  // protección correcta para la corrida periódica. Pero un REDISEÑO cambia casi todos los rótulos a
  // propósito: cuanto mejor es el rediseño, más seguro lo bloquea. La puerta hay que tipearla en el
  // comando; un timer no la escribe. No apaga la firma ni el candado, que corren arriba.
  const REDISENAR = process.argv.includes('--rediseniar') || process.argv.includes('--rediseñar')
  if (REDISENAR) {
    console.log('  ⚠ --rediseniar: el dueño pidió reemplazar el layout, así que NO se compara contra los rótulos viejos.')
  } else {
    const auto = await autoRespetarReescritura(ID, PESTANA, filas, previo)
    if (auto.reescrita) {
      console.log(`  ✋ NO escribo: "${PESTANA}" fue reescrita entera fuera del OS${auto.motivo ? ` (${auto.motivo})` : ''}, así que la tomo como tuya.`)
      console.log('     Si el rediseño es a pedido tuyo, volvé a correrlo con --rediseniar.')
      return
    }
  }

  // Ajustar la banda al alto exacto: insertar las que faltan o quitar las que sobran. El registro se
  // corre entero, y las pestañas que lo leen lo hacen por rango de columna anclado en la geometría
  // (lib/cheques-emitidos-geometria.mjs), así que correrlo no rompe ninguna referencia.
  if (bandaActual !== BANDA) {
    const r = await google.spreadsheetBatchUpdate(ID, [bandaActual < BANDA
      ? { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BANDA - bandaActual }, inheritFromBefore: false } }
      : { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: bandaActual - BANDA } } }])
    // ═══ SI LA GEOMETRÍA NO CAMBIÓ, TODO LO DE ABAJO ESCRIBIRÍA EN EL LUGAR EQUIVOCADO (03/09) ═══
    //
    // La guarda por celda frena un borrado de filas cuando en el tramo hay algo del dueño. Seguir
    // como si la banda se hubiera achicado deja el registro escrito con un desfasaje: el encabezado
    // en una fila y los datos en otra. Abortar deja la pestaña como está, que es reversible.
    const corte = abortaPorGeometria(r)
    if (corte.aborta) {
      console.error(`⛔ no pude ajustar la banda de ${bandaActual} a ${BANDA} filas (${corte.motivo}). `
        + 'No escribo el registro: con la geometría vieja quedaría corrido. Resolvelo y volvé a correrlo.')
      process.exit(1)
    }
    console.log(`  ↕ la banda pasó de ${bandaActual} a ${BANDA} filas: el registro arranca ahora en la ${FILA_HDR + 1}`)
  }

  // Una celda COMBINADA sólo acepta escritura en su ancla: escribir en cualquier otra celda del merge
  // se ignora EN SILENCIO —sin error, sin valor—. Se desarma la banda antes de escribirla.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: COLS } },
  }]).catch(() => {})

  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA, filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}") en vez de "${String(r.mio).slice(0, 44)}"`)

  const escrito = await google.escribirValoresPorCeldas(ID, sheetId, grid)
  if (escrito?.protegido) {
    console.log(`  ✋ NO escribo: la guarda central frenó "${PESTANA}"${escrito.motivo ? ` (${escrito.motivo})` : ''}.`)
    return
  }
  // LA ESCRITURA SE VERIFICA LEYENDO SU DESTINO, no por lo que devolvió la API. Un log que felicita
  // sin haber escrito manda a buscar el defecto al lado equivocado, y eso ya costó una tarde.
  await verificarAterrizaje(google, grid)

  await sellarFirma(google, ID, PESTANA, `'${PESTANA}'`)
  await guardarRegistro(ID, PESTANA, grid, ediciones, previo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  await formatear(google, sheetId, grid)
  await verificar(google)
}

/**
 * El mes que muestra el calendario. ES UNA CELDA DE ENTRADA DEL DUEÑO: se lee antes de tocar nada y
 * se devuelve tal cual para que la escritura la reponga igual.
 *
 * SÓLO SE LEE SI LA BANDA YA TIENE LA GEOMETRÍA NUEVA. Con otro alto, la fila del selector todavía no
 * existe —o tiene otra cosa— y leerla sería adoptar como "elección del dueño" lo que hubiera quedado
 * en esa fila del diseño anterior. La primera corrida del rediseño arranca con el mes corriente.
 */
async function leerSelector(google, bandaActual) {
  if (bandaActual !== BANDA) return SELECTOR_DEFECTO
  const celda = `'${PESTANA}'!${String.fromCharCode(65 + COL_SELECTOR)}${FILAS.calendario}`
  const [formula, valor] = await Promise.all([
    google.readSheetValues(ID, celda, { render: 'FORMULA' }).catch(() => null),
    google.readSheetValues(ID, celda, { render: 'UNFORMATTED_VALUE' }).catch(() => null),
  ])
  // Falla cerrado: si no se pudo leer, queda el default y NO se inventa un mes.
  return selectorAConservar(formula?.[0]?.[0], valor?.[0]?.[0])
}

/** Prueba que la escritura aterrizó comparando UNA celda de fórmula contra su destino. Que la API
 *  conteste 200 no prueba absolutamente nada en esta pestaña: ver la nota del encabezado. */
async function verificarAterrizaje(google, grid) {
  const fila = FILAS.kpi
  const releido = await google.readSheetValues(ID, `'${PESTANA}'!B${fila}:B${fila}`, { render: 'FORMULA' }).catch(() => null)
  const esperado = grid[fila - 1][1]
  const vino = releido?.[0]?.[0]
  if (esperado && vino !== esperado) {
    throw new Error(`la escritura NO aterrizó: B${fila} tendría que decir "${String(esperado).slice(0, 60)}" `
      + `y dice "${String(vino).slice(0, 60)}". No sigo dando por buena una pestaña que no cambió.`)
  }
}

const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: 'Arial' })
/** Negativos entre paréntesis y el cero como raya: norma de banca de inversión. */
const MONEDA = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' }

/**
 * El formato de la banda. La piel común (estilo-statement) pone el fondo, los bordes y la tipografía
 * de estructura; acá va lo que ella no puede saber: moneda, el mes del selector, el calendario.
 *
 * ═══ LO QUE ESTA CORRIDA LIMPIA A PROPÓSITO ═══
 * La piel repinta TODA la banda —fondo, bordes, tipografía y alto de fila— de la 1 a la BANDA, así
 * que los formatos fantasma del diseño anterior (la moneda pegada en B1:B4, el formato de fecha en
 * F18/G18) se van solos: no hace falta borrarlos uno por uno, hace falta que nadie escriba más allá
 * del bloque que le corresponde. No se le pasa `filasHoja`: limpiar hasta el final de la HOJA
 * borraría el formato del registro, que es del dueño.
 *
 * ═══ LO QUE NO TOCA, Y ES UNA DECISIÓN ═══
 * LOS ANCHOS DE COLUMNA, salvo el de la A. El calendario ocupa B..H y ésas son también las columnas
 * del registro (B Nro, C fecha, D CUIT, E Proveedor…). Emparejarlas para que el calendario quede
 * prolijo le comería el ancho a "Proveedor" y truncaría un dato que el dueño lee todos los días. El
 * calendario envuelve y sus filas van altas; el registro se queda como está.
 */
async function formatear(google, sheetId, grid) {
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const cal0 = FILAS.semana0 - 1
  const req = [
    // CONGELAR HASTA EL ENCABEZADO DEL REGISTRO. Estaban en 2, y el dueño perdía los rótulos de las
    // columnas apenas scrolleaba: con 105 cheques, "¿esta columna era la fecha de pago o la de
    // emisión?" se contestaba subiendo hasta arriba. Congelar 26 cuesta pantalla y la paga entera.
    ...skinRequests({ sheetId, filas: grid, cols: COLS, congeladas: FILA_HDR, titular: 0 }),
    // La banda DESBORDA por defecto (un rótulo cortado al medio es un error de imprenta); el
    // calendario, más abajo, pisa esto con WRAP porque ahí sí hay contenido a la derecha.
    { repeatCell: { range: rg(0, BANDA, 0, COLS), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },

    // ── LOS INDICADORES ────────────────────────────────────────────────────────────────────────
    // Rótulo chico y apagado ARRIBA, número grande ABAJO: el ojo cae en la cifra y sólo sube al
    // rótulo si no la reconoce. Es al revés de una planilla, y es lo que la hace leerse en segundos.
    { repeatCell: { range: rg(FILAS.rotulosKpi - 1, FILAS.rotulosKpi, 0, 7), cell: { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 8 }), horizontalAlignment: 'LEFT', numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,numberFormat)' } },
    { repeatCell: { range: rg(FILAS.kpi - 1, FILAS.kpi, 0, 7), cell: { userEnteredFormat: { numberFormat: MONEDA, horizontalAlignment: 'LEFT', textFormat: txt(INK, { bold: true, size: 13 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // PROYECTADO es la respuesta de la pestaña: el saldo del banco todavía no descontó los cheques
    // firmados, y éste sí. Lleva el único acento de color de toda la banda.
    { repeatCell: { range: rg(FILAS.kpi - 1, FILAS.kpi, 2, 3), cell: { userEnteredFormat: { numberFormat: MONEDA, textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,textFormat)' } },
    { repeatCell: { range: rg(FILAS.rotulosKpi - 1, FILAS.rotulosKpi, 2, 3), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 8 }) } }, fields: 'userEnteredFormat.textFormat' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: FILAS.kpi - 1, endIndex: FILAS.kpi }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },

    // ── EL CALENDARIO ──────────────────────────────────────────────────────────────────────────
    { repeatCell: { range: rg(FILAS.calendario - 1, FILAS.calendario, 0, 1), cell: { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 11 }) } }, fields: 'userEnteredFormat.textFormat' } },
    // El selector se ve "agosto 2026" aunque adentro haya una fecha: el desplegable ofrece fechas
    // porque es lo que necesitan las 42 fórmulas; el formato es para la persona que lo lee.
    { repeatCell: { range: rg(FILAS.calendario - 1, FILAS.calendario, COL_SELECTOR, COL_SELECTOR + 1), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmmm yyyy' }, horizontalAlignment: 'LEFT', textFormat: txt(INK, { bold: true, size: 11 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    { updateBorders: { range: rg(FILAS.calendario - 1, FILAS.calendario, COL_SELECTOR, COL_SELECTOR + 1), top: { style: 'SOLID', width: 1, color: HAIR }, bottom: { style: 'SOLID', width: 1, color: HAIR }, left: { style: 'SOLID', width: 1, color: HAIR }, right: { style: 'SOLID', width: 1, color: HAIR } } },
    { repeatCell: { range: rg(FILAS.diasSemana - 1, FILAS.diasSemana, COL_SELECTOR, COL_SELECTOR + DIAS), cell: { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 8 }), horizontalAlignment: 'CENTER', numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,numberFormat)' } },
    // Las 42 celdas son TEXTO de dos renglones: sin WRAP el segundo renglón no se ve y el calendario
    // parece vacío. Alineadas arriba a la izquierda, como un calendario de verdad.
    { repeatCell: { range: rg(cal0, cal0 + SEMANAS, COL_SELECTOR, COL_SELECTOR + DIAS), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', textFormat: txt(INK, { size: 9 }) } }, fields: 'userEnteredFormat(numberFormat,wrapStrategy,horizontalAlignment,verticalAlignment,textFormat)' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: cal0, endIndex: cal0 + SEMANAS }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },

    // ── EL RESUMEN ─────────────────────────────────────────────────────────────────────────────
    { repeatCell: { range: rg(FILAS.resumenHdr - 1, FILAS.resumenHdr, 1, 3), cell: { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 8 }), horizontalAlignment: 'RIGHT', numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,numberFormat)' } },
    { updateBorders: { range: rg(FILAS.resumenHdr - 1, FILAS.resumenHdr, 0, 3), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    { repeatCell: { range: rg(FILAS.vencido - 1, FILAS.total, 1, 2), cell: { userEnteredFormat: { numberFormat: MONEDA, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(FILAS.vencido - 1, FILAS.total, 2, 3), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0;;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },

    // El rótulo del registro: versalita apagada, sin adornos. Así lo tenía la versión que al dueño le
    // gustaba — "REGISTRO" a secas.
    { repeatCell: { range: rg(FILAS.registro - 1, FILAS.registro, 0, 1), cell: { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 9 }) } }, fields: 'userEnteredFormat.textFormat' } },
    // Encabezado del registro: versalita apagada con hairline. Es la ÚNICA fila fuera de la banda que
    // este script formatea, y lo hace porque es el borde entre los dos bloques.
    { repeatCell: { range: rg(FILA_HDR - 1, FILA_HDR, 0, COLS), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    { updateBorders: { range: rg(FILA_HDR - 1, FILA_HDR, 0, COLS), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
    validacionDelSelector(sheetId),
  ]

  const cf = await google.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}?fields=sheets(properties(sheetId),conditionalFormats(ranges))`)
    .catch(() => null)
  const propias = indicesPropios(cf?.sheets?.find((s) => s.properties?.sheetId === sheetId)?.conditionalFormats || [])
  if (propias.length) console.log(`  🧹 ${propias.length} regla(s) condicional(es) de la banda, borradas antes de poner las propias`)
  req.push(...reglasDelCalendario(sheetId, propias))

  await google.spreadsheetBatchUpdate(ID, req)
}

/** Releer y probar que el control cierra. Un control que se compara contra la misma celda que produce
 *  no es un control: acá el total del resumen sale de seis tramos y el comprometido de una sola
 *  pasada sobre el registro; que den igual prueba que la partición no tiene hueco ni solapamiento. */
async function verificar(google) {
  const chk = await google.readSheetValues(ID, `'${PESTANA}'!A1:M${BANDA}`)
  const n = (s) => Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  const errores = (chk || []).flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  const kpi = chk?.[FILAS.kpi - 1] || []
  const comprometido = n(kpi[1])
  const totalTramos = n(chk?.[FILAS.total - 1]?.[1])
  console.log(`✔ ${PESTANA} — ${String(chk?.[FILAS.corte - 1]?.[0] ?? '')}`)
  console.log(`  disponible ${kpi[0]} · comprometido ${kpi[1]} · ⇒ proyectado ${kpi[2]}`)
  console.log(`  vencido ${kpi[3]} · próx. 7 ${kpi[4]} · próx. 30 ${kpi[5]} · mayor día ${kpi[6]}`)
  console.log(`  control tramos vs comprometido: ${totalTramos === comprometido ? '✓ cierra' : `✖ NO cierra (${totalTramos} vs ${comprometido})`}`)
  console.log(`  ${errores} celda(s) en error`)
  if (errores || totalTramos !== comprometido) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
