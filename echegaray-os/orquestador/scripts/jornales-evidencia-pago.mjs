#!/usr/bin/env node
// LA TABLA DE EVIDENCIA DE PAGO DE LAS QUINCENAS — para que el dueño confirme la columna "Pagado el".
//
// ═══ QUÉ ES ═══
//
// SÓLO LECTURA. No escribe una celda, no tiene `--aplicar` y no lo va a tener: la columna N "Pagado
// el" es dato del dueño y el OS no la fabrica (ver jornales-pestana.mjs, "ES LA CELDA DEL DUEÑO").
// Lo que este script produce es la EVIDENCIA para que él la confirme en un solo mensaje: quincena,
// se paga el, TOTAL, lo que dice la columna hoy, y lo que dice el banco.
//
// ═══ POR QUÉ EXISTE (16/08/2026) ═══
//
// La columna N se desalineó y ocho quincenas quedaron sin fecha. `libro-extractores-nomina.mjs` leía
// esa ausencia como "impaga" y publicó $70.431.250 de deuda que nadie debía. El criterio nuevo vive
// en `lib/jornales-testigos.mjs` y lo usan LOS DOS: el libro para decidir el estado, y este script
// para mostrar la evidencia. Una sola definición — si mañana cambia la regla, cambian los dos juntos.
//
//   node orquestador/scripts/jornales-evidencia-pago.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { debitosDelExtracto, corteDelExtracto } from '../lib/libro-respaldo-banco.mjs'
import { lotesDeHaberes, testigoDeQuincena, VEREDICTO, GRITAN } from '../lib/jornales-testigos.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Los rangos con nombre del registro. Por NOMBRE y no por fila: el bloque ya se movió dos veces. */
const NOMBRES = ['JORNALES_REAL_DESDE', 'JORNALES_REAL_HASTA', 'JORNALES_REAL_PAGO',
  'JORNALES_REAL_BANCO', 'JORNALES_REAL_ADELANTO', 'JORNALES_REAL_RECIBO',
  'JORNALES_REAL_TOTAL', 'JORNALES_REAL_PAGADO']

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const col = (v) => (Array.isArray(v) ? v : []).map((c) => (Array.isArray(c) ? c[0] : c))
const pesos = (n) => (n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)
const fecha = (s) => (num(s) === null ? '—' : isoDeSerial(s))

/**
 * LA FILA FÍSICA DEL REGISTRO, para que el dueño sepa DÓNDE escribir.
 *
 * Sale del rango con nombre, no de una constante: el día que el bloque se mueva otra vez, este
 * número se mueve con él. Un 134 tipeado acá manda al dueño a la fila equivocada sin dar un error.
 */
async function ubicarColumnaPagado(google) {
  const rangos = await google.getNamedRanges(ID)
  const r = rangos.find((x) => x.name === 'JORNALES_REAL_PAGADO')
  const t = rangos.find((x) => x.name === 'JORNALES_REAL_TOTAL')
  if (!r || !t) return null
  return { f0: t.range.startRowIndex + 1, fn: t.range.endRowIndex, col: r.range.startColumnIndex + 1 }
}

/**
 * LAS FECHAS DE "Pagado el" QUE QUEDARON FUERA DEL REGISTRO.
 *
 * En el archivo vivo son N126:N132 — siete seriales dibujados con formato de MONEDA (se leen
 * "$46.160") arriba del encabezado. No los escribió el dueño: los dejó ahí el generador
 * (`jornales-pestana.mjs`, la rama que copia la columna POR NÚMERO DE FILA cuando no reconoce la
 * cabecera — su propio log lo dice: "puede desalinearse si la pestaña creció"). Y no se van solos
 * porque el generador declara toda la columna VACÍA y `preservar-anotaciones` conserva lo que había:
 * quedaron protegidos como si fueran una anotación del dueño.
 *
 * Se LISTAN, no se limpian: `clearValues` sobre una pestaña de contenido está prohibido
 * (`no-borrar.mjs`) y borrar celdas es la vía declarada, con una persona nombrándolas.
 */
async function huerfanas(google, ubi) {
  if (!ubi) return []
  const letra = String.fromCharCode(64 + ubi.col)
  const filas = await google.readSheetValues(ID, `'Jornales por Quincena'!${letra}1:${letra}`,
    { render: 'UNFORMATTED_VALUE' })
  const out = []
  filas.forEach((f, i) => {
    const fila = i + 1
    if (fila >= ubi.f0 && fila <= ubi.fn) return
    const v = num(Array.isArray(f) ? f[0] : f)
    if (v !== null && v > 40000) out.push({ celda: `${letra}${fila}`, serial: v })
  })
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig() })
  const leer = (r) => google.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })
  const [banco, ...rangos] = await Promise.all([leer('_BANCO_RAW!A1:F'), ...NOMBRES.map(leer)])
  const R = Object.fromEntries(NOMBRES.map((n, i) => [n, col(rangos[i])]))
  const ubi = await ubicarColumnaPagado(google)
  const f0 = ubi?.f0 ?? null

  const debitos = debitosDelExtracto(banco)
  const corte = corteDelExtracto(banco)
  const desdeExtracto = Math.min(...debitos.map((d) => d.fecha))
  const lotes = lotesDeHaberes(debitos)

  console.log('EVIDENCIA DE PAGO — «Jornales por Quincena», registro de obra')
  console.log(`  extracto _BANCO_RAW: del ${fecha(desdeExtracto)} al ${fecha(corte)} · ${lotes.size} día(s) con haberes`)
  console.log('  ⚠ ESTE SCRIPT NO ESCRIBE. La columna «Pagado el» es tuya: confirmá y la cargás vos.\n')

  const anchoTotal = R.JORNALES_REAL_TOTAL.length
  const filas = []
  for (let i = 0; i < anchoTotal; i++) {
    const q = {
      pago: num(R.JORNALES_REAL_PAGO[i]),
      hasta: num(R.JORNALES_REAL_HASTA[i]),
      banco: num(R.JORNALES_REAL_BANCO[i]),
      pagado: num(R.JORNALES_REAL_PAGADO[i]),
    }
    if (!num(R.JORNALES_REAL_TOTAL[i])) continue
    const t = testigoDeQuincena(q, { lotes, corte, desdeExtracto })
    filas.push({ i, q, t, total: num(R.JORNALES_REAL_TOTAL[i]), desde: num(R.JORNALES_REAL_DESDE[i]) })
  }

  const enc = ['fila', 'quincena', 'se paga el', 'TOTAL', 'por banco', 'dice N hoy', 'dice el banco', 'veredicto']
  const cuerpo = filas.map((f) => [
    f0 ? String(f0 + f.i) : `#${f.i + 1}`,
    `${fecha(f.desde)} → ${fecha(f.q.hasta)}`,
    fecha(f.q.pago),
    pesos(f.total),
    pesos(f.q.banco),
    f.q.pagado === null ? '(vacía)' : fecha(f.q.pagado),
    f.t.veredicto === VEREDICTO.banco || f.t.veredicto === VEREDICTO.conciliado
      ? `${pesos(f.t.cubierto)} el ${fecha(f.t.fecha)}` : '—',
    f.t.veredicto,
  ])
  const ancho = enc.map((_, c) => Math.max(enc[c].length, ...cuerpo.map((f) => f[c].length)))
  const linea = (f) => f.map((v, c) => (c >= 3 && c <= 6 ? v.padStart(ancho[c]) : v.padEnd(ancho[c]))).join('  ')
  console.log(linea(enc))
  console.log(ancho.map((a) => '─'.repeat(a)).join('  '))
  for (const f of cuerpo) console.log(linea(f))

  // ── LO QUE HAY QUE MIRAR, CON SU MONTO. Un veredicto sin pesos no mueve una decisión. ──
  console.log('')
  const porVeredicto = new Map()
  for (const f of filas) {
    if (!porVeredicto.has(f.t.veredicto)) porVeredicto.set(f.t.veredicto, [])
    porVeredicto.get(f.t.veredicto).push(f)
  }
  for (const [v, fs] of porVeredicto) {
    const suma = fs.reduce((a, f) => a + f.total, 0)
    console.log(`  ${v.padEnd(17)} ${String(fs.length).padStart(2)} quincena(s) · ${pesos(suma)}`)
  }
  const nombrar = (f) => `    · f${f0 ? f0 + f.i : f.i + 1} quincena al ${fecha(f.q.hasta)} · ${pesos(f.total)} · ${f.t.motivo}`
  // LAS DOS LISTAS SE SEPARAN PORQUE EL EFECTO ES DISTINTO. Una fecha imposible no crea deuda (la
  // quincena es vieja y el libro la deja REAL por su fecha prevista): corrompe el MES en que la plata
  // aparece. La falta de testigo sí crea deuda. Mezclarlas haría parecer que el problema es uno solo.
  const imposibles = filas.filter((f) => f.t.veredicto === VEREDICTO.imposible)
  if (imposibles.length) {
    console.log('\n  ⚠ «Pagado el» DICE UNA FECHA QUE NO PUEDE SER — el libro la ignora y usa la prevista:')
    for (const f of imposibles) console.log(nombrar(f))
  }
  const sinPrueba = filas.filter((f) => GRITAN.includes(f.t.veredicto) && f.t.veredicto !== VEREDICTO.imposible)
  if (sinPrueba.length) {
    const suma = sinPrueba.reduce((a, f) => a + f.total, 0)
    console.log(`\n  ⚠ SIN PRUEBA — el libro las cuenta como deuda (${pesos(suma)}) y ninguna fuente lo confirma:`)
    for (const f of sinPrueba) console.log(nombrar(f))
  }
  if (imposibles.length || sinPrueba.length) {
    console.log('\n  → Si estas quincenas están pagadas, cargá la fecha en la columna N («Pagado el») de')
    console.log('    esas filas. Es TU columna: ningún generador la escribe.')
  }

  const orfanas = await huerfanas(google, ubi)
  if (orfanas.length) {
    console.log(`\n  ⚠ ${orfanas.length} fecha(s) de «Pagado el» FUERA del registro (filas ${f0}-${ubi.fn}):`)
    // A QUÉ QUINCENA LE CORRESPONDE CADA UNA. Las siete huérfanas coinciden una a una con "Se paga
    // el" de las filas del registro que hoy están sin fecha: es la columna del dueño, desplazada.
    // Decirlo acá es lo que le permite confirmar las quince en un solo mensaje.
    for (const o of orfanas) {
      const k = R.JORNALES_REAL_PAGO.findIndex((v) => num(v) === o.serial)
      const dueña = k >= 0 ? ` = «Se paga el» de la f${f0 + k}` : ' — no coincide con ninguna quincena'
      console.log(`    · ${o.celda} = ${fecha(o.serial)} (serial ${o.serial}, dibujado como moneda)${dueña}`)
    }
    console.log('    No las escribió nadie a propósito: las dejó ahí jornales-pestana.mjs al copiar la')
    console.log('    columna por número de fila cuando no reconoció la cabecera del registro, y sobreviven')
    console.log('    porque el generador declara la columna vacía y la guarda anti-borrado las conserva.')
    console.log('    → El OS NO las borra: clearValues sobre una pestaña de contenido está prohibido')
    console.log(`      (no-borrar.mjs). Seleccioná ${orfanas[0].celda}:${orfanas[orfanas.length - 1].celda} en el`)
    console.log('      Sheet, borralas a mano, y volvé a correr este script para verificar que no quedó ninguna.')
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
