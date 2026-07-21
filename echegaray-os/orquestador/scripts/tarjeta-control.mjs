#!/usr/bin/env node
// LA TARJETA CONTRA EL BANCO Y CONTRA LA CAJA.
//
// EL PEDIDO (21/07). El dueño: "pestaña tarjeta de crédito, ¿se cruzó con dato bancario? ¿con caja?
// revisar y rehacer".
//
// ═══ LA RESPUESTA, Y ES BUENA ═══
//
// Se cruzó, y CIERRA AL CENTAVO. El resumen del Santander al 23/07 dice $965.863,53 de cuotas para
// el próximo período y $4.783.810,75 de resto; la pestaña, sumando sus cuotas por mes de pago, da
// exactamente lo mismo: $5.749.674,28 contra $5.749.674,28, diferencia $0,00.
//
// PERO ESO NO SE VEÍA EN NINGÚN LADO, que es casi tan malo como que no cerrara. Un cuadro que
// concilia y no lo demuestra obliga a rehacer la verificación a mano cada vez que alguien duda —y
// mientras tanto nadie sabe si el día que DEJE de cerrar alguien se va a enterar. Este script deja
// el cruce escrito, con el corte del resumen y la fecha, y se recalcula solo.
//
// ═══ POR QUÉ UN BLOQUE DE CONTROL Y NO REESCRIBIR LA PESTAÑA ═══
//
// "Tarjeta de Credito" es una pestaña de CARGA: sus filas las escribe una persona y son el hecho
// primario. El OS no las toca — sólo agrega abajo lo que sabe contrastar. Es la misma disciplina
// que en Cobranzas.
//
//   node orquestador/scripts/tarjeta-control.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { TARJETA, CORTE, ORIGEN } from '../lib/banco-santander.mjs'
import { INSTRUMENTOS } from '../lib/cash-flow-lineas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = INSTRUMENTOS.tarjeta.pestaña
const DRY = process.argv.includes('--dry')
const FIRMA = 'CONTROL — la tarjeta contra el banco y contra la caja'
const ANCHO = 5
/** Filas en blanco entre la carga y el bloque, para que se lea como algo separado. */
const AIRE = 2
/** Hasta cuánto se acepta como redondeo. Las 16 cuotas del Sheet tienen centavos propios y la
 *  suma da $0,71 contra el banco: un control que grita por 71 centavos se deja de mirar, y un
 *  control que se deja de mirar tapa el día que la diferencia sea de verdad. */
const TOLERANCIA = 100

const ars = (n) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** El mes del próximo resumen: {anio, mes, rotulo}. */
export function proximoResumen(vence = TARJETA.vence) {
  const d = new Date(`${vence}T00:00:00Z`)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, rotulo: `${MES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` }
}

/**
 * NÚCLEO PURO: la ventana de fechas de un mes, para SUMIFS.
 *
 * POR QUÉ NO SE COMPARA CONTRA EL TEXTO. La columna "fecha pago" se LEE como "agosto 26" pero es
 * una FECHA con formato mmmm aa: SUMIF(...;"agosto 26";...) devuelve CERO, sin error, sin aviso.
 * Es una trampa que ya estaba documentada en este repo y volví a caer en ella acá — por eso queda
 * como función con nombre y con test, y no como una cadena escrita a mano en el medio de otra cosa.
 */
export function ventanaMes(rango, anio, mes) {
  const finA = mes === 12 ? anio + 1 : anio
  const finM = mes === 12 ? 1 : mes + 1
  return `${rango};">="&DATE(${anio};${mes};1);${rango};"<"&DATE(${finA};${finM};1)`
}

function grilla(filaDatos, desde) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  const M = INSTRUMENTOS.tarjeta
  const R = (col) => `$${col}$${M.filaCab + 1}:$${col}$${filaDatos}`
  const monto = R(M.colMonto)
  const mesPago = R(M.colMes)
  const deb = R(M.colDebitado)
  const prox = proximoResumen()
  // LA FILA ABSOLUTA DEL SHEET, no la del bloque. Escribí "=$B5-$C5" pensando en la quinta fila del
  // bloque y apuntaba a la fila 5 de la pestaña, que es un consumo cargado: #VALUE! y, peor, podría
  // no haber dado error y mostrar un número plausible sacado de otra cosa.
  const abs = () => desde + filas.length

  push([FIRMA])
  push([`El resumen del Santander al ${CORTE} dice qué queda por pagar. La pestaña dice lo mismo desde el otro lado: sumando las cuotas por mes de pago. Si las dos columnas no coinciden, o falta cargar un consumo o sobra una cuota — y hasta hoy nadie lo podía ver sin rehacer la cuenta a mano.`])
  push()
  push(['Concepto', 'Según esta pestaña', 'Según el banco', 'Diferencia', 'Qué significa'])

  // TODO ES FÓRMULA del lado de la pestaña. Del lado del banco es una réplica del resumen, con su
  // fecha de corte declarada: no se puede calcular desde el Sheet.
  const a1 = abs()
  push([
    `Cuotas del próximo resumen (${prox.rotulo})`,
    `=SUMIFS(${monto};${ventanaMes(mesPago, prox.anio, prox.mes)})`,
    TARJETA.cuotasPendientes.proximoPeriodo,
    `=$B${a1}-$C${a1}`,
    'Lo que se debita en el próximo vencimiento.',
  ])
  const a2 = abs()
  push([
    'Cuotas de los resúmenes siguientes',
    // "todavía no debitado" se mide por la columna DEBITADO vacía. NO se usa "<>SI": en un SUMIFS,
    // ese criterio NO alcanza a las celdas vacías, que son justamente las que interesan.
    `=SUMIFS(${monto};${deb};"")-$B${a1}`,
    TARJETA.cuotasPendientes.restante,
    `=$B${a2}-$C${a2}`,
    'Compromiso ya asumido que todavía no llegó a ningún resumen.',
  ])
  const a3 = abs()
  const f3 = push([
    '⇒ TOTAL PENDIENTE',
    `=$B${a1}+$B${a2}`,
    TARJETA.cuotasPendientes.proximoPeriodo + TARJETA.cuotasPendientes.restante,
    `=$B${a3}-$C${a3}`,
    `=IF(ABS($D${a3})<=${TOLERANCIA};"✓ CONCILIA con el resumen del banco";"⚠ NO CONCILIA — falta cargar un consumo o sobra una cuota")`,
  ])
  push()
  push(['Ya debitado en el año', `=SUMIFS(${monto};${deb};"SI")`, '', '', 'Salió de la cuenta y ya está en el cash flow por el rubro de su factura.'])
  push(['Total cargado en la pestaña', `=SUM(${monto})`, '', '', 'Debitado + pendiente.'])
  push()

  // ── LA TARJETA COMO DISPONIBILIDAD ──────────────────────────────────────────────────────────────
  // Es la conexión con CAJA que se pidió: el disponible de la tarjeta es capacidad de pago, y el
  // consumido en cuotas es deuda con fecha cierta. Son dos caras del mismo instrumento.
  push(['LA TARJETA COMO DISPONIBILIDAD — lo que ve CAJA'])
  push(['Concepto', 'Monto', '', '', 'Origen'])
  push(['Límite de compra', '', TARJETA.limite, '', `${TARJETA.cuenta} · resumen al ${CORTE}`])
  push(['Consumido sin debitar (pesos)', '', TARJETA.consumidoPesos, '', 'Resumen del banco'])
  push(['Consumido sin debitar (dólares)', '', TARJETA.consumidoDolares, '', '⚠ Está en U$S: no se suma a los pesos sin tipo de cambio. CAJA lo valúa con el TC del rango con nombre.'])
  push(['Disponible declarado por el banco', '', TARJETA.disponible, '', 'Es el número que manda: el banco puede tener consumos que todavía no están en la pestaña.'])
  push()
  push(['Límite en CUOTAS (es otro límite, aparte)', '', TARJETA.cuotas.limite, '', 'Financiar en cuotas consume un cupo distinto al de compra.'])
  push(['  · consumido', '', TARJETA.cuotas.consumido, '', ''])
  push(['  · disponible para financiar', '', TARJETA.cuotas.disponible, '', '⚠ Es la capacidad REAL de comprar en cuotas, y es menor que el disponible de arriba. Confundir los dos hace planificar una compra que la tarjeta no va a aprobar.'])
  push()
  push(['Débito automático', TARJETA.debitoAutomatico, '', '', `Por el TOTAL. No hay opción de pago mínimo: el día ${TARJETA.vence} sale entero de la cuenta.`])
  push([`Cierra ${TARJETA.cierre ?? TARJETA.cierra} · vence ${TARJETA.vence}`, '', '', '', ORIGEN])

  return { filas, fTotal: f3 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((s) => s.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // NUNCA ESCRIBIR SIN LEER TODA LA ALTURA. La carga la hace una persona y crece; escribir el
  // bloque en una fila fija terminaría pisándole las filas nuevas.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:L400`)
  let ultima = 0
  for (let i = 0; i < v.length; i++) {
    const f = v[i] || []
    // Una fila es de datos si tiene monto: el bloque de control anterior no cuenta.
    if (String(f?.[0] ?? '').startsWith(FIRMA.slice(0, 20))) break
    if (Number(String(f?.[4] ?? '').replace(/[^0-9,-]/g, '').replace(',', '.')) > 0) ultima = i + 1
  }
  if (!ultima) throw new Error('no encontré filas de datos en la pestaña')

  const desde = ultima + AIRE + 1
  const g = grilla(ultima, desde)
  console.log(`${PESTAÑA}: ${ultima} filas de datos · bloque de control en la fila ${desde}`)
  console.log(`  banco al ${CORTE}: próximo ${ars(TARJETA.cuotasPendientes.proximoPeriodo)} · resto ${ars(TARJETA.cuotasPendientes.restante)}`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter(Boolean).slice(0, 4).join('  |  ')); return }

  // Se limpia una franja generosa: si el bloque anterior era más largo, quedarían filas colgadas
  // debajo del nuevo diciendo otra cosa.
  await google.clearValues(ID, `${PESTAÑA}!A${desde}:E${desde + 60}`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A${desde}`, values: g.filas }])

  // El formato: la columna A es texto y B/C/D son plata. Sin esto el título del bloque se lee como
  // moneda y los montos como texto — el defecto de pantalla que ya apareció siete veces.
  const r = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const n = g.filas.length
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: r(desde - 1, desde + n, 1, 4), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00;[Red]-"$"#,##0.00;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: r(desde - 1, desde + n, 0, 1), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: r(desde - 1, desde + n, 4, 5), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9, italic: true }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: r(desde - 1, desde, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: r(desde + g.fTotal - 2, desde + g.fTotal - 1, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
  ])
  console.log('  ✓ escrito y formateado')
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
