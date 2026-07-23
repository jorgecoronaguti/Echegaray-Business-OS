#!/usr/bin/env node
// _BANCO_RAW — EL EXTRACTO DEL SANTANDER ADENTRO DEL SHEET.
//
// POR QUÉ EXISTE (21/07). Es el tercer insumo que se trae con el mismo criterio, después de
// _ARCA_RAW (libro de IVA) y _F931_RAW (las DDJJ leídas del PDF). La regla es siempre la misma:
//
//     Si el insumo no está en el archivo, se trae el INSUMO — no se pega el RESULTADO.
//
// Sin el extracto adentro, tres números de CAJA tenían que calcularse en JavaScript y pegarse: los
// depósitos de efectivo de la ventana, el saldo de la cuenta y la cartera de echeqs. Un número
// pegado envejece en silencio: se agrega un movimiento y el cuadro sigue mostrando el de ayer.
//
// ═══ Y ADEMÁS DESBLOQUEA DOS DE LAS TRES ALERTAS DE CAJA ═══
//
// El bloque "LO QUE NO CIERRA" muestra $20.000.000 de echeqs que el cash flow espera y ya se
// entregaron, y $15.730.646 de efectivo cobrado que no se depositó. Las dos preguntas se contestan
// mirando movimientos del banco, y hasta hoy la respuesta vivía en un array de JavaScript que nadie
// podía abrir desde el Sheet.
//
// ES UNA RÉPLICA, Y SE DECLARA COMO TAL: la fila 1 dice de qué cuenta es, a qué fecha está cortada y
// de dónde salió. Una réplica que no dice cuándo se sacó envejece sin gritar — el defecto que ya
// rompió el espejo de JORNALES y el IPC en este mismo archivo.
//
//   node orquestador/scripts/banco-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as BANCO from '../lib/banco-santander.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { publicar } from '../lib/rangos-nombrados.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_BANCO_RAW'
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas de CAJA lo referencian. */
export const COLUMNAS = [
  ['Fecha', 'fecha'], ['Concepto', 'texto'], ['Importe', 'monedaExacta'], ['Saldo después', 'monedaExacta'],
  ['Entra o sale', 'texto'], ['Naturaleza', 'texto'],
]
export const COL = { fecha: 'A', concepto: 'B', importe: 'C', saldo: 'D', signo: 'E', naturaleza: 'F' }
export const FILA0 = 4

/**
 * EL BLOQUE DEL SALDO DECLARADO — la única celda del archivo que dice cuánta plata hay HOY.
 *
 * POR QUÉ VA AL COSTADO Y NO COMO UNA FILA MÁS (23/07). No es un movimiento: es el saldo que el
 * banco declara al cierre del día, y el detalle no lo puede reproducir solo porque los movimientos
 * del día llegan SIN saldo corrido. Meterlo como fila rompería la cadena de saldos, que es el
 * control que hace confiable a toda la réplica.
 *
 * Y VA A PARTIR DE LA COLUMNA H, dejando la G libre: de la A a la F cuelgan por fórmula CAJA,
 * Impuestos y Cheques con rangos abiertos ($A$4:$A). Un bloque metido adentro de esas columnas se
 * sumaría como si fuera un movimiento.
 *
 * SE LEE POR NOMBRE, NO POR CELDA: `SALDO_BANCO_DECLARADO` y `SALDO_BANCO_FECHA`. Es la misma
 * decisión que TIPO_CAMBIO_USD — una referencia por celda muere en silencio el día que la pestaña
 * cambia de forma.
 */
export const DECL = { col: 'H', colValor: 'I', fila0: 1, iCol: 7, iValor: 8 }
export const RANGO_SALDO = 'SALDO_BANCO_DECLARADO'
export const RANGO_SALDO_FECHA = 'SALDO_BANCO_FECHA'

/**
 * NÚCLEO PURO: las cuatro filas del bloque, a partir de la columna H.
 *
 * Devuelve pares [rótulo, valor]. Sin saldo declarado devuelve los rótulos con el valor en el
 * CENTINELA: así el bloque se limpia solo cuando el extracto nuevo no trae la línea "Saldo al …",
 * en vez de dejar el saldo de anteayer haciéndose pasar por el de hoy.
 *
 * @param {{fecha:string, saldo:number, origen:string}|null} decl
 */
export function bloqueDeclarado(decl) {
  return [
    // EL RÓTULO TIENE QUE ENTRAR EN SU COLUMNA. "SALDO QUE DECLARA EL BANCO" es más ancho que la H y
    // el render lo mostraba mutilado ("ALDO QUE DECLARA EL BANCO"): un encabezado al que le falta
    // una letra se lee como un error del archivo. Se vio mirando el PDF, no leyendo la celda.
    ['SALDO DECLARADO', ''],
    ['Fecha', decl ? decl.fecha : VACIO],
    ['Saldo', decl ? Number(decl.saldo) : VACIO],
    ['Origen', decl ? String(decl.origen ?? '') : VACIO],
  ]
}

/**
 * NÚCLEO PURO: una fila de la réplica.
 *
 * La NATURALEZA no está en el extracto: la deduce el OS (lib/banco-santander.mjs) y por eso se
 * escribe en su propia columna, al lado del concepto original y sin tocarlo. Un depósito de efectivo
 * y un cobro son las dos cosas un "ingreso" para el banco, y sólo una es plata nueva.
 */
export function fila(m) {
  const entra = Number(m.importe) >= 0
  return [
    String(m.fecha ?? ''),
    String(m.concepto ?? ''),
    Number(m.importe) || 0,
    // ═══ UN SALDO QUE FALTA NO ES CERO ═══
    //
    // `Number(undefined) || 0` escribía 0 en los movimientos del día, que van al FINAL de la
    // réplica. Y la disponibilidad de CAJA sale de `formulaUltimoSaldo`, que toma la ÚLTIMA celda
    // NO VACÍA de esta columna: con un 0 escrito ahí, CAJA mostraba cero pesos en el banco. Hasta
    // hoy no se veía porque la última fila era una fila inventada ("hold intradía") que sí traía
    // saldo; en cuanto el 23/07 entraron dos movimientos del día de verdad, quedaba a la vista.
    //
    // Vacío significa "el banco todavía no confirmó el saldo después de este movimiento", que es
    // exactamente lo que pasa: el depósito de e-cheq de otras plazas tarda 48 hs en acreditarse.
    //
    // Va el CENTINELA, no una cadena vacía: en la fusión que preserva lo escrito por una persona,
    // '' significa "no es mi celda, no la toques" —y entonces la celda se quedaría con lo que
    // hubiera de antes— mientras que VACIO significa "es mi celda y va vacía". Ver
    // lib/preservar-anotaciones.mjs.
    m.saldo == null || m.saldo === undefined ? VACIO : Number(m.saldo),
    entra ? 'entra' : 'sale',
    // LA NATURALEZA SE ESCRIBE PARA TODOS, TAMBIÉN PARA LO QUE SALE (21/07).
    //
    // Antes sólo se llenaba en los ingresos, y eso dejaba la mitad más grande del extracto sin
    // clasificar: 65 de los 70 movimientos son egresos. Sin naturaleza en la columna, la pregunta
    // "¿cuánto salió del banco en cheques, y la pestaña de Cheques Emitidos lo tiene?" no se podía
    // contestar con una fórmula — había que calcularla afuera y pegar el resultado.
    //
    // Es la columna que hace posible la conciliación por naturaleza: cada peso que salió tiene una
    // pestaña donde debería estar registrado, y ahora el Sheet lo puede preguntar solo.
    BANCO.clasificarMovimiento(m.concepto ?? ''),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // ═══ EL EXTRACTO SALE DE LA BASE, NO DEL CÓDIGO ═══
  //
  // Hasta hoy los movimientos eran un array escrito a mano en lib/banco-santander.mjs: cargar el
  // extracto del día significaba editar JavaScript, y un dato operativo que sólo se actualiza
  // tocando el código no se actualiza — envejece. Ahora entran por
  // `scripts/importar-banco.mjs` (CSV o pegado), con deduplicación y verificación de la cadena de
  // saldos, y esta réplica los lee de `public.banco_movimientos`.
  //
  // SI LA BASE NO CONTESTA, SE USA EL ARRAY. No es pereza: dejar la pestaña en cero porque falló una
  // conexión sería mucho peor que mostrar el último extracto conocido — de _BANCO_RAW cuelgan por
  // fórmula la disponibilidad de CAJA, el impuesto al cheque y el cruce de Cheques.
  //
  // El ORDEN es contrato: primero la cadena con saldo corrido, y al final los movimientos del día
  // (sin saldo), para que el último saldo de la réplica sea el DECLARADO por el banco y CAJA muestre
  // lo que hay hoy, no el último saldo corrido del detalle.
  let movs = null
  try {
    const { rows } = await query(
      `select fecha, concepto, importe, saldo_despues as saldo
         from public.banco_movimientos
        order by (saldo_despues is null), fecha, id`,
    )
    if (rows.length) {
      movs = rows.map((r) => ({
        fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
        concepto: r.concepto,
        importe: Number(r.importe),
        saldo: r.saldo == null ? undefined : Number(r.saldo),
      }))
      console.log(`fuente: public.banco_movimientos — ${movs.length} movimiento(s)`)
    }
  } catch (e) {
    console.warn(`⚠ no pude leer public.banco_movimientos (${String(e.message).slice(0, 70)}): uso el extracto del código`)
  }
  if (!movs) {
    console.log('fuente: el array del código (la base todavía no tiene movimientos — corré importar-banco.mjs --sembrar)')
    movs = [
      ...[...BANCO.MOVIMIENTOS].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
      ...(BANCO.MOVIMIENTOS_DIA ?? []),
    ]
  }
  // ═══ Y EL SALDO QUE EL BANCO DECLARA, QUE NO ES UN MOVIMIENTO ═══
  //
  // El detalle termina en el último saldo CONFIRMADO. Los movimientos del día llegan sin saldo
  // corrido, así que sin este dato CAJA muestra la plata de ayer: al 23/07 mostraba $4.982.191,63
  // cuando el banco declaraba $4.813.461,54 —los $168.730,09 de la compra con débito ya habían
  // salido de la cuenta y ninguna celda lo reflejaba—.
  let decl = null
  try {
    const { rows } = await query(
      `select fecha, saldo, origen from public.banco_saldo_declarado order by fecha desc limit 1`,
    )
    if (rows.length) {
      decl = {
        fecha: rows[0].fecha instanceof Date ? rows[0].fecha.toISOString().slice(0, 10) : String(rows[0].fecha).slice(0, 10),
        saldo: Number(rows[0].saldo),
        origen: rows[0].origen,
      }
    }
  } catch (e) {
    console.warn(`⚠ no pude leer public.banco_saldo_declarado (${String(e.message).slice(0, 70)})`)
  }
  console.log(decl
    ? `saldo declarado por el banco al ${decl.fecha}: $${decl.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : '⚠ sin saldo declarado cargado: CAJA va a mostrar el último saldo confirmado del detalle (corré importar-banco.mjs con un extracto que traiga la línea "Saldo al …")')

  const datos = movs.map(fila)
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  console.log(`${datos.length} movimientos del extracto · corte del banco ${BANCO.CORTE}`)
  const entran = datos.filter((f) => f[4] === 'entra')
  console.log(`  entran ${entran.length} por ${Math.round(entran.reduce((s, f) => s + f[2], 0)).toLocaleString('es-AR')} · salen ${datos.length - entran.length}`)
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
  // EL ANCHO TIENE QUE ALCANZAR PARA EL BLOQUE DEL SALDO DECLARADO. Escribir en una columna que no
  // existe no da un error visible: la API recorta el rango y el bloque desaparece sin avisar.
  const ancho = DECL.iValor + 1
  if ((hoja.cols ?? 0) < ancho) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { columnCount: ancho } }, fields: 'gridProperties.columnCount' } }])
    hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  }

  // NO se borra nada escrito por una persona (regla de oro): se arma la grilla completa
  // —título, nota, encabezados y datos— y se FUSIONA con lo que hay. Ver lib/preservar-anotaciones.mjs.
  const gridRaw = [
    [`_BANCO_RAW — extracto del ${BANCO.CUENTA?.banco ?? 'Santander'} ${BANCO.CUENTA?.numero ?? ''} · corte del banco ${BANCO.CORTE} · réplica del ${corte}`],
    [`${datos.length} movimientos. NO se carga a mano: la reescribe el agente desde la réplica del extracto. Existe para que los números de CAJA que hoy salen del banco sean FÓRMULAS y no valores calculados afuera y pegados. La columna "Naturaleza" NO está en el extracto: la deduce el OS —un depósito de efectivo y un cobro son las dos cosas un ingreso para el banco, y sólo una es plata nueva—.`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]
  // EL BLOQUE DEL SALDO DECLARADO, AL COSTADO. Se pega sobre las cuatro primeras filas de la grilla
  // —columnas H e I— sin tocar ni una celda de la A a la F.
  bloqueDeclarado(decl).forEach(([rotulo, valor], i) => {
    const f = gridRaw[DECL.fila0 - 1 + i] ?? (gridRaw[DECL.fila0 - 1 + i] = [])
    while (f.length < DECL.iCol) f.push('')
    f[DECL.iCol] = rotulo
    f[DECL.iValor] = valor
  })
  // ═══ LA COLA DE UNA CORRIDA ANTERIOR ═══
  //
  // Esta réplica puede ACORTARSE: si un movimiento se borra de la base (una carga equivocada que se
  // deshace), la grilla nueva tiene menos filas y las de más abajo SOBREVIVEN — el precio declarado
  // de no borrar nunca. Y sobreviven en silencio: el extracto muestra un movimiento que ya no
  // existe, la cadena de saldos no cierra, y de acá cuelga la disponibilidad de CAJA.
  //
  // Se extiende con el centinela VACIO, que significa "es mi celda y va vacía": limpia lo que dejó
  // este generador y CONSERVA cualquier anotación de una persona en una columna que no ocupa.
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:${String.fromCharCode(64 + COLUMNAS.length)}1000`).catch(() => [])
  let ultimaConDato = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaConDato = i + 1 })
  if (ultimaConDato > gridRaw.length) {
    console.log(`  cola de una corrida anterior: limpio las filas ${gridRaw.length + 1}–${ultimaConDato}`)
    for (let i = gridRaw.length; i < ultimaConDato; i++) gridRaw.push(Array(COLUMNAS.length).fill(VACIO))
  }
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, gridRaw, { anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, ancho),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 1 ? 300 : j >= 4 ? 110 : E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  // EL BLOQUE DEL SALDO DECLARADO: encabezado arriba, rótulos a la izquierda, cifras a la derecha.
  // OVERFLOW y no WRAP: con ajuste de texto el rótulo se partía en dos renglones ("SALDO QUE DECLARA
  // EL / BANCO") y el encabezado quedaba el doble de alto que la fila del título de al lado.
  reqs.push({ repeatCell: { range: rg(0, 1, DECL.iCol, DECL.iValor + 1), cell: { userEnteredFormat: { ...E.encabezado(), wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: rg(1, 2, DECL.iValor, DECL.iValor + 1), cell: { userEnteredFormat: E.celda('fecha') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
  reqs.push({ repeatCell: { range: rg(2, 3, DECL.iValor, DECL.iValor + 1), cell: { userEnteredFormat: E.celda('monedaExacta') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
  reqs.push({ repeatCell: { range: rg(3, 4, DECL.iValor, DECL.iValor + 1), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: DECL.iCol, endIndex: DECL.iCol + 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } })
  reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: DECL.iValor, endIndex: DECL.iValor + 1 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // LOS NOMBRES. CAJA no cita `_BANCO_RAW!$I$3`: cita SALDO_BANCO_DECLARADO. Una referencia por
  // celda muere en silencio el día que la pestaña cambia de forma — el defecto que ya dejó las dos
  // filas más importantes del Cash Flow Mensual en blanco.
  await publicar(google, ID, hoja.sheetId, [
    { name: RANGO_SALDO_FECHA, fila: DECL.fila0 + 1, col: DECL.iValor + 1 },
    { name: RANGO_SALDO, fila: DECL.fila0 + 2, col: DECL.iValor + 1 },
  ])
  console.log(`  rangos con nombre: ${RANGO_SALDO_FECHA} → ${PESTAÑA}!${DECL.colValor}${DECL.fila0 + 1} · ${RANGO_SALDO} → ${PESTAÑA}!${DECL.colValor}${DECL.fila0 + 2}`)

  // VERIFICACIÓN: hay un saldo escrito por cada movimiento que TRAE saldo.
  //
  // No por cada movimiento: los del día vienen sin saldo corrido a propósito, y contarlos como
  // faltantes convertía el control en una alarma que suena siempre —y una alarma que suena siempre
  // se apaga—. Lo que sí importa es que ninguno de los que tienen saldo se haya perdido.
  const conSaldo = datos.filter((f) => typeof f[3] === 'number').length
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.saldo}${FILA0}:${COL.saldo}${FILA0 + datos.length}`)
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`${PESTAÑA}: ${datos.length} movimientos · ${escritas} con saldo escrito (esperados ${conSaldo}; ${datos.length - conSaldo} del día todavía sin saldo corrido)`)
  if (escritas !== conSaldo) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
