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
import { INSTRUMENTOS } from '../lib/cash-flow-lineas.mjs'
import { CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'
import { EN_CARTERA } from '../lib/cartera-cheques.mjs'
import { PESTAÑA as RAW_CHEQUES, COL as COL_CHEQUE, FILA0 as FILA0_CHEQUES } from './cheques-raw-pestana.mjs'
import { BORDES } from '../lib/caja-grilla.mjs'

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
 * NÚCLEO PURO: los bordes de los tramos del calendario, con los MISMOS rótulos que arma CAJA.
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
  // LOS RÓTULOS SALEN DE `BORDES`, NO SE COPIAN. Este conciliador compara tramo por tramo contra lo que
  // muestra CAJA, y hasta hoy tenía su propia lista de nombres escrita a mano: el día que uno de los dos
  // renombrara un tramo, el cruce empezaría a comparar "Esta semana" contra nada y reportaría un desvío
  // que no existe — o peor, dejaría de reportar uno que sí. Una capacidad, una fuente.
  const hastas = [hoy, hoy + 7, hoy + 14, Math.max(hoy + 14, finMes), Math.max(hoy + 14, finMesQueViene), null]
  return BORDES.map(([rotulo], k) => ({ rotulo, hasta: hastas[k] }))
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

/**
 * NÚCLEO PURO: abre la diferencia entre el modelo y la pestaña TRAMO POR TRAMO y LADO POR LADO.
 *
 * POR QUÉ NO ALCANZA CON EL NÚMERO FINAL (05/08/2026). El script decía "no cierra por $12.188.441" y
 * ahí terminaba: con un solo número no se puede saber si la pestaña ve egresos de más, ingresos de
 * menos, o las dos cosas compensándose. Un residuo que no se puede atribuir a un lado no es una
 * conciliación, es una alarma.
 *
 * La diferencia de PISO es la suma acumulada de las diferencias de tramo hasta el tramo del piso: por
 * eso la última columna acumula. Si todas las diferencias de tramo dan cero y el piso igual no cierra,
 * el problema está en el saldo de arranque, no en el calendario.
 *
 * @param {Array<{rotulo:string}>} bordes
 * @param {Array<number>} entraModelo
 * @param {Array<number>} saleModelo
 * @param {Map<string,{entra:number, sale:number}>} pestaña por rótulo de tramo
 * @returns {Array<{rotulo:string, difEntra:number, difSale:number, dif:number, acum:number, falta:boolean}>}
 */
/**
 * NÚCLEO PURO: los vencimientos del calendario fiscal (IVA + IIBB), en serial de Sheets.
 *
 * MISMA CUENTA QUE LA PESTAÑA, A PROPÓSITO: el IVA/IIBB de un período se paga alrededor del 20 del mes
 * siguiente, o sea fin del mes del período + 20 días. Es literalmente lo que escribe
 * `formulaCalendarioImpuestosSemana`. Si acá se usara otra regla de timing, el conciliador estaría
 * midiendo su propia opinión y la diferencia no significaría nada.
 *
 * @param {number} anio el año de la grilla de "Impuestos y Financieros"
 * @param {Array<number>} iva doce meses, enero primero · @param {Array<number>} iibb ídem
 * @returns {Array<{fecha:number, monto:number}>}
 */
export function vencimientosFiscales(anio, iva = [], iibb = []) {
  const out = []
  for (let m = 1; m <= 12; m++) {
    const finDelMes = dateASerial(new Date(Date.UTC(anio, m, 0)))
    const monto = num(iva[m - 1]) + num(iibb[m - 1])
    if (monto) out.push({ fecha: finDelMes + 20, monto })
  }
  return out
}

export function descomponerPorTramo(bordes, entraModelo, saleModelo, pestaña) {
  let acum = 0
  return bordes.map((b, k) => {
    const p = pestaña.get(b.rotulo)
    // El signo es SIEMPRE "pestaña − modelo", igual que el veredicto final: negativo = la pestaña ve
    // menos plata que el modelo. Invertirlo en un lado y no en el otro haría que las columnas no sumen.
    const difEntra = num(p?.entra) - entraModelo[k]
    const difSale = -(num(p?.sale) - saleModelo[k])
    const dif = difEntra + difSale
    acum += dif
    return { rotulo: b.rotulo, difEntra, difSale, dif, acum, falta: !p }
  })
}

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
  /** Lo que el calendario viejo contaba DE MÁS: cheques cuya factura ya viaja dentro de su rubro. */
  const duplicados = []
  /** Lo que NO se puede afirmar en ninguna dirección. No suma a ningún piso: define la BANDA. */
  const incierto = []

  // 1 · Cheques emitidos no debitados.
  //
  // ═══ EL CHEQUE ES EL INSTRUMENTO, LA FACTURA ES LA OBLIGACIÓN: SUMAR LOS DOS ES CONTAR DOS VECES ═══
  //
  // La primera versión de este script sumaba TODOS los cheques no debitados y ADEMÁS todos los
  // rubros de Compras. Casi todo cheque librado paga una factura que ya está cargada en Compras, así
  // que esa plata entraba dos veces: medido al 04/08, $43.678.423 de cheques con fecha anterior al
  // 31/08 contra apenas $1.000.000 que el cash flow reconoce como "sin factura cargada".
  //
  // La regla correcta ya existe en el archivo y la usa el cash flow desde el 21/07: suma Compras
  // entera MÁS sólo los cheques cuya factura NO está cargada. El cruce por número de comprobante se
  // hace en código y su resultado queda ESCRITO en la columna de marca de cada pestaña, así que acá
  // se lee esa marca en vez de rehacer la normalización ("0001-000036" contra "1-36").
  const marcaCol = (inst) => { let s = ''; for (let x = inst.colMarca; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s; return s }
  for (const [clave, inst] of Object.entries(INSTRUMENTOS)) {
    const f0 = inst.filaCab + 1
    const [imp, fecha, deb, marca] = await Promise.all([
      col(`'${inst.pestaña}'!${inst.colMonto}${f0}:${inst.colMonto}400`),
      col(`'${inst.pestaña}'!${inst.colFecha}${f0}:${inst.colFecha}400`),
      col(`'${inst.pestaña}'!${inst.colDebitado}${f0}:${inst.colDebitado}400`),
      col(`'${inst.pestaña}'!${marcaCol(inst)}${f0}:${marcaCol(inst)}400`),
    ])
    // ═══ CUATRO GRUPOS, NO DOS — Y LA DIFERENCIA VALÍA $38.377.479 (05/08) ═══
    //
    // Acá decía: `sinFactura` = los marcados FALTA, y `duplicados` = todo el resto, con el rótulo
    // "librados con su factura ya cargada en Compras". Ese "todo el resto" incluía DOS cosas que no
    // tienen su factura verificada: los que no tienen N° de comprobante (no se puede saber) y los que
    // el OS todavía no miró (marca vacía). Medido contra el Sheet real ese mismo día: OCHO cheques por
    // $38.377.479, cargados después de la última corrida del marcador, que este verificador declaraba
    // cubiertos. Un verificador que afirma lo que no sabe es peor que no tenerlo — es el mismo defecto
    // que vino a corregir, cometido del otro lado.
    const G = { falta: [], sinNumero: [], sinMarca: [], ok: [] }
    imp.forEach((v, i) => {
      if (String(deb[i] ?? '').toUpperCase() === 'SI' || !esNum(fecha[i])) return
      const m = String(marca[i] ?? '').trim()
      const item = { fecha: fecha[i], monto: num(v) }
      if (m === MARCAS.falta) G.falta.push(item)
      else if (m === MARCAS.sinNumero) G.sinNumero.push(item)
      else if (!m) G.sinMarca.push(item)
      else G.ok.push(item)   // ✓ verificado o ≈ inferido: hay evidencia de que su factura está cargada
    })
    // EL CALENDARIO VIEJO LEÍA UNA SOLA PESTAÑA: "Cheques Emitidos". La tarjeta no la miraba, así que
    // para que la línea base sea fiel su deuda NO puede atribuirse al calendario viejo.
    const loLeiaElViejo = clave === 'cheques'
    conceptos.push({ nombre: `${inst.nombre} sin factura en Compras`, enViejo: loLeiaElViejo, enNuevo: true, tramos: repartir(G.falta, bordes) })
    // El que SÍ la tiene ya viaja dentro de su rubro de Compras: sólo el calendario viejo lo sumaba.
    duplicados.push({ nombre: `${clave}: librados con su factura ya cargada en Compras`, enViejo: loLeiaElViejo, tramos: repartir(G.ok, bordes) })
    // LAS DOS INCERTIDUMBRES, SEPARADAS Y CON NOMBRE. No entran a ningún piso: son la BANDA entre el
    // mejor y el peor caso, que es lo que se publica más abajo.
    incierto.push({ nombre: `${clave}: sin N° de comprobante — no se puede verificar`, tramos: repartir(G.sinNumero, bordes) })
    incierto.push({ nombre: `${clave}: el OS todavía no los miró (marca vacía)`, tramos: repartir(G.sinMarca, bordes) })
  }

  // 2 · Nómina de obra: quincena cerrada sin pagar (desde el corte) + proyectada.
  const [jrPago, jrPagado, jrTotal, jpPago, jpTotal] = await Promise.all([
    col('JORNALES_REAL_PAGO'), col('JORNALES_REAL_PAGADO'), col('JORNALES_REAL_TOTAL'),
    col('JORNALES_PROY_PAGO'), col('JORNALES_PROY_TOTAL'),
  ])
  const jornales = []
  // ANTES DEL CORTE MANDA EL BANCO: una quincena pagada antes del corte YA está en el saldo.
  jrPago.forEach((f, i) => { if (esNum(f) && !esNum(jrPagado[i]) && f >= corte) jornales.push({ fecha: f, monto: num(jrTotal[i]) }) })
  jpPago.forEach((f, i) => { if (esNum(f)) jornales.push({ fecha: f, monto: num(jpTotal[i]) }) })
  conceptos.push({ nombre: 'Jornales de obra', enViejo: true, enNuevo: true, tramos: repartir(jornales, bordes) })

  // 3 · Nómina de administración = OFICINA + DIRECCIÓN. El calendario leía sólo la primera mitad.
  for (const [nombre, pref, visto] of [['Sueldos de oficina', 'OFICINA', true], ['Retiros de Dirección', 'DIRECCION', false]]) {
    const [pago, pagado, proy] = await Promise.all([col(`${pref}_PAGO`), col(`${pref}_PAGADO`), col(`${pref}_PROYECTADO`)])
    const filas = []
    pago.forEach((f, i) => { if (esNum(f) && f >= corte) filas.push({ fecha: f, monto: num(pagado[i]) + num(proy[i]) }) })
    conceptos.push({ nombre, enViejo: visto, enNuevo: true, tramos: repartir(filas, bordes) })
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
    conceptos.push({ nombre: `Compras · ${r}`, enViejo: false, enNuevo: true, tramos: repartir(filas, bordes) })
  }

  // 5 · EL IVA/IIBB A PAGAR. No vive en Compras: lo calcula "Impuestos y Financieros" mes a mes, y la
  // pestaña lo suma al calendario desde el 04/08. Mientras esta cuenta no lo modelaba, la comparación
  // quedaba con un residuo de $31.122.498 repartido en los tramos de septiembre en adelante — grande,
  // sin nombre, y a un cambio de fecha de distancia de caer en el tramo del piso y ensuciar el
  // veredicto. LAS FILAS SE UBICAN POR SU RÓTULO: una fila fija devolvería $0 sin dar error.
  const impA = (await col(`'${CALENDARIO_IMPUESTOS.pestaña}'!A1:A200`)).map((v) => String(v ?? '').trim())
  const filaDe = (rotulo) => impA.indexOf(rotulo) + 1
  const [fIva, fIibb] = [filaDe(CALENDARIO_IMPUESTOS.rotulos.iva), filaDe(CALENDARIO_IMPUESTOS.rotulos.iibb)]
  if (!fIva || !fIibb) {
    throw new Error(`conciliar: no encuentro "${CALENDARIO_IMPUESTOS.rotulos.iva}" / "${CALENDARIO_IMPUESTOS.rotulos.iibb}" `
      + `en "${CALENDARIO_IMPUESTOS.pestaña}" — sin esas filas el IVA quedaría fuera de la comparación y el residuo sería mudo`)
  }
  const fila = async (f) => (await g.readSheetValues(ID, `'${CALENDARIO_IMPUESTOS.pestaña}'!B${f}:M${f}`, { render: 'UNFORMATTED_VALUE' }))?.[0] ?? []
  const [vIva, vIibb] = await Promise.all([fila(fIva), fila(fIibb)])
  // Sólo lo que vence DESPUÉS del corte: lo anterior ya salió y está dentro del saldo del banco.
  const fiscales = vencimientosFiscales(new Date().getFullYear(), vIva, vIibb).filter((x) => x.fecha >= corte)
  conceptos.push({ nombre: 'IVA e IIBB a pagar (calendario fiscal)', enViejo: false, enNuevo: true, tramos: repartir(fiscales, bordes) })

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
  const ciegos = conceptos.filter((c) => !c.enViejo && Math.abs(enMes(c)) > 0.5)
  console.log('EGRESOS DEL MES EN CURSO QUE EL CALENDARIO NO VEÍA  (el piso los ignoraba)')
  console.log('─'.repeat(72))
  for (const c of ciegos.sort((a, b) => enMes(b) - enMes(a))) {
    console.log(`  ${c.nombre.padEnd(52)} ${pesos(enMes(c)).padStart(16)}`)
  }
  const totalCiego = ciegos.reduce((a, c) => a + enMes(c), 0)
  console.log('─'.repeat(72))
  console.log(`  ${'faltaban'.padEnd(52)} ${pesos(totalCiego).padStart(16)}\n`)

  // Y del otro lado: lo que el calendario viejo contaba DE MÁS. El cheque es el instrumento y la
  // factura la obligación; sumar los dos es contar la misma plata dos veces.
  console.log('...Y LO QUE CONTABA DOS VECES  (el piso los restaba de más)')
  console.log('─'.repeat(72))
  for (const d of duplicados) console.log(`  ${d.nombre.padEnd(52)} ${pesos(enMes(d)).padStart(16)}`)
  const totalDup = duplicados.reduce((a, d) => a + enMes(d), 0)
  console.log('─'.repeat(72))
  console.log(`  sobraban${' '.repeat(44)} ${pesos(totalDup).padStart(16)}`)
  console.log(`  ${'EFECTO NETO SOBRE EL PISO DEL MES'.padEnd(52)} ${pesos(totalDup - totalCiego).padStart(16)}\n`)

  console.log('EL PISO, ANTES Y DESPUÉS')
  console.log('─'.repeat(72))
  let saldoViejo = disponible, saldoNuevo = disponible
  let peorViejo = { v: Infinity }, peorNuevo = { v: Infinity }
  const saleModelo = []
  bordes.forEach((b, k) => {
    const saleViejo = conceptos.filter((c) => c.enViejo).reduce((a, c) => a + c.tramos[k], 0)
      + duplicados.filter((d) => d.enViejo).reduce((a, d) => a + d.tramos[k], 0)
    const saleNuevo = conceptos.filter((c) => c.enNuevo).reduce((a, c) => a + c.tramos[k], 0)
    saleModelo.push(saleNuevo)
    saldoViejo += entra[k] - saleViejo
    saldoNuevo += entra[k] - saleNuevo
    if (saldoViejo < peorViejo.v) peorViejo = { v: saldoViejo, tramo: b.rotulo, hasta: b.hasta }
    if (saldoNuevo < peorNuevo.v) peorNuevo = { v: saldoNuevo, tramo: b.rotulo, hasta: b.hasta }
    console.log(`  ${b.rotulo.padEnd(28)} ${(b.hasta ? fmtFecha(b.hasta) : '—').padStart(11)}  `
      + `${pesos(saldoViejo).padStart(15)} → ${pesos(saldoNuevo).padStart(15)}`)
  })
  console.log('─'.repeat(72))
  console.log(`  piso del calendario VIEJO   : ${pesos(peorViejo.v)}  (${peorViejo.tramo}, hasta ${fmtFecha(peorViejo.hasta)})`)
  console.log(`  piso con la definición única: ${pesos(peorNuevo.v)}  (${peorNuevo.tramo}, hasta ${fmtFecha(peorNuevo.hasta)})`)
  console.log(`  el piso estaba inflado en   : ${pesos(peorViejo.v - peorNuevo.v)}\n`)

  // ═══ ENTRE QUÉ Y QUÉ ESTÁ PARADO EL DUEÑO ═══
  //
  // El piso de arriba se calcula con lo que se PUEDE AFIRMAR. Pero hay cheques cuya cobertura no se
  // sabe: sin N° de comprobante no hay contra qué cruzarlos, y los que el OS todavía no miró tampoco
  // cuentan. Un piso sin esa banda al lado se lee como certeza y con eso se decide cuánta plata se
  // inmoviliza en un plazo fijo. Se publican las DOS puntas: la de arriba supone que todos tienen su
  // factura cargada (y entonces ya viajan por su rubro) y la de abajo supone que ninguno la tiene.
  console.log('LA BANDA — LO QUE NO SE PUEDE AFIRMAR EN NINGUNA DIRECCIÓN')
  console.log('─'.repeat(72))
  for (const c of incierto) {
    const t = c.tramos.reduce((a, b) => a + b, 0)
    if (Math.abs(t) > 0.5) console.log(`  ${c.nombre.padEnd(52)} ${pesos(t).padStart(16)}`)
  }
  let saldoPeor = disponible; let pisoPeor = Infinity
  bordes.forEach((b, k) => {
    const sale = conceptos.filter((c) => c.enNuevo).reduce((a, c) => a + c.tramos[k], 0)
      + incierto.reduce((a, c) => a + c.tramos[k], 0)
    saldoPeor += entra[k] - sale
    if (saldoPeor < pisoPeor) pisoPeor = saldoPeor
  })
  console.log('─'.repeat(72))
  console.log(`  PISO si TODOS tienen su factura cargada (mejor caso): ${pesos(peorNuevo.v)}`)
  console.log(`  PISO si NINGUNO la tiene              (peor  caso): ${pesos(pisoPeor)}`)
  console.log(`  ancho de la banda                                  : ${pesos(peorNuevo.v - pisoPeor)}\n`)

  // ── LO QUE LA PESTAÑA MUESTRA DE VERDAD ────────────────────────────────────────────────────────
  //
  // ═══ ESTO FALTABA, Y SIN ESTO EL SCRIPT NO VERIFICA NADA (04/08) ═══
  //
  // El encabezado prometía "recién al final compara contra lo que las dos pestañas muestran", y no lo
  // hacía: las dos cifras de arriba son DOS MODELOS de este mismo archivo. Comparar un modelo con
  // otro no prueba que la pestaña haya cambiado — es exactamente el "control validado contra la misma
  // información que produce" que este trabajo entero vino a matar, cometido por el verificador.
  //
  // Ahora se lee la celda que CAJA publica. LA FILA SE BUSCA POR SU RÓTULO: el punto más bajo se
  // mueve cada vez que el calendario gana o pierde una fila, y una referencia fija leería otra cosa
  // sin dar error. Si la pestaña todavía no se regeneró, la diferencia lo dice con su número.
  //
  // ═══ Y SE BUSCA POR EL CONCEPTO, NO POR LA FRASE (05/08) ═══
  //
  // Estaba atado al texto exacto 'el punto más bajo del horizonte' y el rediseño de CAJA reescribió
  // ese rótulo. El conciliador cerró los seis tramos en $0 —el modelo y la pestaña coincidían al
  // peso— y terminó diciendo "no encontré la fila: sin ella no puedo verificar el efecto". Tercera
  // vez en el mismo día que un contrato entre piezas estaba escrito como una frase: un rótulo se
  // reescribe cuando mejora la lectura, y no puede llevarse puesto a un control.
  //
  // El ancla es el CONCEPTO —una línea anotada que habla del piso— y no la redacción. Si mañana el
  // rótulo vuelve a cambiar, esto lo sigue encontrando; si desaparece la línea, lo dice.
  const ROTULO_PISO = /^·.*\bpiso\b/i
  const caja = await g.readSheetValues(ID, 'CAJA!A1:F', { render: 'UNFORMATTED_VALUE' })
  const iPiso = caja.findIndex((f) => ROTULO_PISO.test(String(f?.[0] ?? '').trim()))

  // ── LA DIFERENCIA, ABIERTA POR TRAMO Y POR LADO ────────────────────────────────────────────────
  // Las filas del calendario se buscan POR RÓTULO, igual que el piso: son las mismas seis constantes
  // que `bordesDeTramos` usa de este lado, así que si un día divergen el cuadro muestra "—" y no una
  // resta contra la fila equivocada.
  const porRotulo = new Map()
  for (const b of bordes) {
    const i = caja.findIndex((f) => String(f?.[0] ?? '').trim() === b.rotulo)
    if (i >= 0) porRotulo.set(b.rotulo, { entra: num(caja[i]?.[2]), sale: num(caja[i]?.[3]) })
  }
  const abierta = descomponerPorTramo(bordes, entra, saleModelo, porRotulo)
  console.log('DÓNDE ESTÁ LA DIFERENCIA — pestaña menos modelo, tramo por tramo')
  console.log('─'.repeat(72))
  console.log(`  ${'Tramo'.padEnd(28)}${'por lo que ENTRA'.padStart(17)}${'por lo que SALE'.padStart(17)}`)
  for (const t of abierta) {
    console.log(`  ${(t.falta ? `${t.rotulo} (no está en CAJA)` : t.rotulo).padEnd(28)}`
      + `${pesos(t.difEntra).padStart(17)}${pesos(t.difSale).padStart(17)}   acum ${pesos(t.acum)}`)
  }
  console.log('')

  console.log('EL VEREDICTO — LO QUE LA PESTAÑA MUESTRA CONTRA LO QUE DEBERÍA MOSTRAR')
  console.log('─'.repeat(72))
  if (iPiso < 0) {
    console.log('  ⚠ no encontré en CAJA ninguna línea anotada que hable del piso: sin ella no puedo verificar el efecto.\n')
    process.exitCode = 1
    return
  }
  // ═══ LA COLUMNA E, QUE ES DONDE VIVE EL NÚMERO QUE DECIDE (05/08) ═══
  //
  // Leía la F. Con el contrato de columnas nuevo de CAJA —A concepto · B moneda · C y D los insumos ·
  // E el número que decide · F la fecha— la F trae la FECHA del piso: un serial de Sheets. El control
  // habría comparado $81.484.555 contra 46246 y cantado un desvío de ochenta millones que no existe.
  const escrito = num(caja[iPiso]?.[4])
  console.log(`  piso escrito en CAJA (fila ${iPiso + 1}) : ${pesos(escrito)}`)
  console.log(`  piso con la definición única        : ${pesos(peorNuevo.v)}`)
  // ═══ POR QUÉ NO SE EXIGE EL PESO EXACTO ═══
  //
  // El cajón en dólares se revalúa entre una lectura y la otra, así que las dos corridas no ven el
  // mismo saldo inicial. Medido: ~$850 de deriva. El umbral es de MIL PESOS —tres órdenes de magnitud
  // por debajo del error que este trabajo corrigió— y NO se relaja: si un día no cierra por más que
  // eso, es porque el calendario y esta cuenta volvieron a contar cosas distintas.
  //
  // LA DIFERENCIA QUE ANTES ERA "LEGÍTIMA Y DECLARADA" YA NO EXISTE (05/08): el IVA/IIBB del calendario
  // fiscal se modela arriba, con la misma regla de vencimiento que escribe la pestaña, así que el
  // residuo de los tramos de septiembre en adelante bajó de $31.122.498 a $0. Un residuo declarado es
  // mejor que uno oculto, pero uno medido es mejor que los dos: mientras estaba declarado, nadie podía
  // saber si adentro del "IVA" viajaba además otro error.
  //
  // LO QUE SIGUE SIN MODELARSE, Y HAY QUE SABERLO: interés del descubierto, comisiones bancarias e
  // impuesto al cheque. La pestaña también los pone en CERO y lo declara en su propio control, así que
  // los dos lados coinciden en el número — pero coinciden en un cero que ninguno de los dos midió.
  const dif = escrito - peorNuevo.v
  const TOLERANCIA = 1000
  console.log(`  el piso sigue inflado en            : ${pesos(dif)}`)
  console.log(Math.abs(dif) <= TOLERANCIA
    ? '\n  ✓ la pestaña muestra el piso de la definición única (dentro de la deriva del dólar).\n'
    : `\n  ✗ NO CIERRA por ${pesos(dif)}. Si es positivo, CAJA sigue viendo de menos y el piso miente.\n`)
  if (Math.abs(dif) > TOLERANCIA) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
