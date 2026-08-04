#!/usr/bin/env node
/**
 * DESCOMPONE, HASTA EL PESO, POR QUÉ EL CALENDARIO DE CAJA Y EL CASH FLOW MENSUAL NO DAN LO MISMO.
 *
 * SÓLO LEE. No escribe una celda. Se puede correr contra el Sheet real sin riesgo.
 *
 * POR QUÉ EXISTE (04/08/2026). El dueño decide cuánto invertir con el "piso proyectado de caja", y
 * los dos cuadros que miran el mismo mes daban $41.704.351 distinto. Mientras la diferencia no se
 * pueda abrir concepto por concepto, las dos vistas son opinión.
 *
 * UN CONTROL NO SE VALIDA CONTRA LA FUENTE QUE PRODUCE EL NÚMERO: esto NO lee las celdas calculadas
 * del calendario para explicarlas. Recalcula todo desde el dato crudo —Cobranzas, Cheques Emitidos,
 * Compras y los bloques de nómina— y recién al final compara contra lo que las dos pestañas muestran.
 * Si el recálculo no reproduce lo que la pestaña dice, lo canta.
 *
 *   node orquestador/scripts/conciliar-caja-vs-cashflow.mjs
 */

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { SUB_BIENES_DE_USO } from '../lib/cash-flow-lineas.mjs'
import { EN_CARTERA } from '../lib/cartera-cheques.mjs'
import { PESTAÑA as RAW_CHEQUES, COL as COL_CHEQUE, FILA0 as FILA0_CHEQUES } from './cheques-raw-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Serial de Sheets → Date. El epoch de Sheets es el 30/12/1899. PURA. */
export const serialADate = (s) => new Date(Date.UTC(1899, 11, 30) + s * 86400000)
/** Date → serial. PURA. */
export const dateASerial = (d) => Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000)
/** dd/mm/aaaa, que es como lee el dueño. PURA. */
export const fmtFecha = (s) => serialADate(s).toLocaleDateString('es-AR', { timeZone: 'UTC' })
/** Pesos con separadores es-AR. PURA. */
export const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

/**
 * NÚCLEO PURO: los bordes de los tramos del calendario, tal como los arma caja-pestana.mjs.
 *
 * LOS BORDES SE FUERZAN CRECIENTES CON MAX y cada tramo es (borde anterior, borde]. Es lo que evita
 * que un vencimiento caiga en dos tramos cuando la ventana de catorce días cruza el fin de mes.
 * @param {number} hoy serial de hoy
 * @returns {Array<{rotulo:string, hasta:number|null}>}
 */
export function bordesDeTramos(hoy) {
  const d = serialADate(hoy)
  const finMes = dateASerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
  const finMesQueViene = dateASerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)))
  return [
    { rotulo: 'Vencido — ya pasó la fecha', hasta: hoy },
    { rotulo: 'Esta semana', hasta: hoy + 7 },
    { rotulo: 'Semana que viene', hasta: hoy + 14 },
    { rotulo: 'Resto de este mes', hasta: Math.max(hoy + 14, finMes) },
    { rotulo: 'El mes que viene', hasta: Math.max(hoy + 14, finMesQueViene) },
    { rotulo: 'Más adelante', hasta: null },
  ]
}

/** NÚCLEO PURO: en qué tramo cae una fecha. Devuelve -1 si no es un número. */
export function tramoDe(fecha, bordes) {
  if (typeof fecha !== 'number' || !Number.isFinite(fecha)) return -1
  for (let k = 0; k < bordes.length; k++) {
    const desde = k === 0 ? -Infinity : bordes[k - 1].hasta
    const hasta = bordes[k].hasta
    if (fecha >= desde && (hasta === null || fecha < hasta)) return k
  }
  return bordes.length - 1
}

/**
 * NÚCLEO PURO: reparte importes en tramos.
 * @param {Array<{fecha:number, monto:number}>} filas
 * @param {Array} bordes
 * @returns {Array<number>} un total por tramo
 */
export function repartir(filas, bordes) {
  const out = bordes.map(() => 0)
  for (const { fecha, monto } of filas) {
    const k = tramoDe(fecha, bordes)
    if (k >= 0) out[k] += monto
  }
  return out
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const esNum = (v) => typeof v === 'number' && Number.isFinite(v)

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const col = async (r) => (await g.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })).map((f) => f?.[0])
  const uno = async (r) => num((await g.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' }))?.[0]?.[0])

  const corte = await uno('CAJA_FECHA_SALDO')
  const hoy = corte
  const bordes = bordesDeTramos(hoy)
  const finAgo = bordes[3].hasta
  const disponible = await uno('CAJA_TOTAL_DISPONIBLE')

  console.log(`\nCorte del saldo: ${fmtFecha(corte)}   ·   disponibilidad percibida: ${pesos(disponible)}`)
  console.log(`Ventana del mes en curso: hasta ${fmtFecha(finAgo)} (excluyente)\n`)

  // ── LO QUE SALE, DESDE EL DATO CRUDO ───────────────────────────────────────────────────────────
  const conceptos = []

  // 1 · Cheques emitidos no debitados. Es lo ÚNICO que el calendario veía además de la nómina.
  const [chF, chI, chK] = await Promise.all([col('Cheques Emitidos!F2:F400'), col('Cheques Emitidos!I2:I400'), col('Cheques Emitidos!K2:K400')])
  const cheques = []
  for (let i = 0; i < 400; i++) {
    if (String(chK[i] ?? '').toUpperCase() === 'SI') continue
    if (!esNum(chI[i])) continue
    cheques.push({ fecha: chI[i], monto: num(chF[i]) })
  }
  conceptos.push({ nombre: 'Cheques emitidos no debitados', loVeElCalendario: true, tramos: repartir(cheques, bordes) })

  // 2 · Nómina de obra: quincena cerrada sin pagar (desde el corte) + proyectada.
  const [jrPago, jrPagado, jrTotal, jpPago, jpTotal] = await Promise.all([
    col('JORNALES_REAL_PAGO'), col('JORNALES_REAL_PAGADO'), col('JORNALES_REAL_TOTAL'),
    col('JORNALES_PROY_PAGO'), col('JORNALES_PROY_TOTAL'),
  ])
  const jornales = []
  // ANTES DEL CORTE MANDA EL BANCO: una quincena pagada antes del corte YA está en el saldo.
  jrPago.forEach((f, i) => { if (esNum(f) && !esNum(jrPagado[i]) && f >= corte) jornales.push({ fecha: f, monto: num(jrTotal[i]) }) })
  jpPago.forEach((f, i) => { if (esNum(f)) jornales.push({ fecha: f, monto: num(jpTotal[i]) }) })
  conceptos.push({ nombre: 'Jornales de obra', loVeElCalendario: true, tramos: repartir(jornales, bordes) })

  // 3 · Nómina de administración = OFICINA + DIRECCIÓN. El calendario leía sólo la primera mitad.
  for (const [nombre, pref, visto] of [['Sueldos de oficina', 'OFICINA', true], ['Retiros de Dirección', 'DIRECCION', false]]) {
    const [pago, pagado, proy] = await Promise.all([col(`${pref}_PAGO`), col(`${pref}_PAGADO`), col(`${pref}_PROYECTADO`)])
    const filas = []
    pago.forEach((f, i) => { if (esNum(f) && f >= corte) filas.push({ fecha: f, monto: num(pagado[i]) + num(proy[i]) }) })
    conceptos.push({ nombre, loVeElCalendario: visto, tramos: repartir(filas, bordes) })
  }

  // 4 · TODO lo demás sale de Compras, por su fecha de caja. NADA de esto lo veía el calendario.
  const [cRubro, cFecha, cTotal, cSub] = await Promise.all([
    col('Compras!AC4:AC5000'), col('Compras!AD4:AD5000'), col('Compras!O4:O5000'), col('Compras!AF4:AF5000'),
  ])
  // La nómina NO se toma de Compras: su fuente es la planilla (arriba). Tomarla acá la duplicaría.
  const DESDE_PLANILLA = new Set(['Nómina · Jornales de obra', 'Nómina · Sueldos administración'])
  const porRubro = new Map()
  for (let i = 0; i < cRubro.length; i++) {
    const r = String(cRubro[i] ?? '').trim()
    if (!r || DESDE_PLANILLA.has(r)) continue
    if (!esNum(cFecha[i]) || cFecha[i] < corte) continue   // antes del corte ya está en el saldo
    const esBienDeUso = String(cSub[i] ?? '').trim() === SUB_BIENES_DE_USO
    const clave = esBienDeUso ? 'Bienes de uso (inversión)' : r
    if (!porRubro.has(clave)) porRubro.set(clave, [])
    porRubro.get(clave).push({ fecha: cFecha[i], monto: num(cTotal[i]) })
  }
  for (const [r, filas] of [...porRubro].sort()) {
    conceptos.push({ nombre: `Compras · ${r}`, loVeElCalendario: false, tramos: repartir(filas, bordes) })
  }

  // ── LO QUE ENTRA ───────────────────────────────────────────────────────────────────────────────
  const [cobM, cobO, cobQ] = await Promise.all([col('Cobranzas!M5:M400'), col('Cobranzas!O5:O400'), col('Cobranzas!Q5:Q400')])
  const esperadas = []
  for (let i = 0; i < 400; i++) {
    const est = String(cobO[i] ?? '').toLowerCase()
    if (est === 'cobrado' || est === 'endosado' || !esNum(cobQ[i])) continue
    esperadas.push({ fecha: cobQ[i], monto: num(cobM[i]) })
  }
  // Y LOS VALORES EN CARTERA, por su fecha de acreditación. NO están en la disponibilidad de hoy
  // (un echeq en custodia todavía no es plata): entran al calendario cuando el banco los acredita.
  const c = (nombre) => `${RAW_CHEQUES}!${COL_CHEQUE[nombre]}${FILA0_CHEQUES}:${COL_CHEQUE[nombre]}400`
  const [caImp, caTipo, caEst, caFp] = await Promise.all([col(c('importe')), col(c('tipo')), col(c('estado')), col(c('fechaPago'))])
  const cartera = []
  caImp.forEach((v, i) => {
    if (String(caTipo[i] ?? '').toLowerCase() !== 'recibido') return
    if (String(caEst[i] ?? '').trim() !== EN_CARTERA) return
    if (esNum(caFp[i])) cartera.push({ fecha: caFp[i], monto: num(v) })
  })
  const entra = repartir([...esperadas, ...cartera], bordes)

  // ── EL CUADRO ──────────────────────────────────────────────────────────────────────────────────
  const enMes = (c) => c.tramos.slice(0, 4).reduce((a, b) => a + b, 0)
  const ciegos = conceptos.filter((c) => !c.loVeElCalendario && Math.abs(enMes(c)) > 0.5)
  console.log('EGRESOS DEL MES EN CURSO QUE EL CALENDARIO NO VEÍA')
  console.log('─'.repeat(72))
  for (const c of ciegos.sort((a, b) => enMes(b) - enMes(a))) {
    console.log(`  ${c.nombre.padEnd(52)} ${pesos(enMes(c)).padStart(16)}`)
  }
  const totalCiego = ciegos.reduce((a, c) => a + enMes(c), 0)
  console.log('─'.repeat(72))
  console.log(`  ${'TOTAL que inflaba el piso'.padEnd(52)} ${pesos(totalCiego).padStart(16)}\n`)

  console.log('EL PISO, ANTES Y DESPUÉS')
  console.log('─'.repeat(72))
  let saldoViejo = disponible, saldoNuevo = disponible
  let peorViejo = { v: Infinity }, peorNuevo = { v: Infinity }
  bordes.forEach((b, k) => {
    const saleViejo = conceptos.filter((c) => c.loVeElCalendario).reduce((a, c) => a + c.tramos[k], 0)
    const saleNuevo = conceptos.reduce((a, c) => a + c.tramos[k], 0)
    saldoViejo += entra[k] - saleViejo
    saldoNuevo += entra[k] - saleNuevo
    if (saldoViejo < peorViejo.v) peorViejo = { v: saldoViejo, tramo: b.rotulo, hasta: b.hasta }
    if (saldoNuevo < peorNuevo.v) peorNuevo = { v: saldoNuevo, tramo: b.rotulo, hasta: b.hasta }
    console.log(`  ${b.rotulo.padEnd(28)} ${(b.hasta ? fmtFecha(b.hasta) : '—').padStart(11)}  `
      + `${pesos(saldoViejo).padStart(15)} → ${pesos(saldoNuevo).padStart(15)}`)
  })
  console.log('─'.repeat(72))
  console.log(`  piso que muestra CAJA hoy : ${pesos(peorViejo.v)}  (${peorViejo.tramo}, hasta ${fmtFecha(peorViejo.hasta)})`)
  console.log(`  piso con la definición única: ${pesos(peorNuevo.v)}  (${peorNuevo.tramo}, hasta ${fmtFecha(peorNuevo.hasta)})`)
  console.log(`  el piso estaba inflado en   : ${pesos(peorViejo.v - peorNuevo.v)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
