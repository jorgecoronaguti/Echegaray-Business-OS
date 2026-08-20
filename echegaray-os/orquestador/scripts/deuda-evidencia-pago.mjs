#!/usr/bin/env node
// LA TABLA DE EVIDENCIA DE PAGO DE TODA LA DEUDA — fila por fila, quién prueba qué.
//
// ═══ QUÉ ES ═══
//
// SÓLO LECTURA. No escribe una celda, no tiene `--aplicar` y no lo va a tener. Es el equivalente de
// `jornales-evidencia-pago.mjs` para el LIBRO ENTERO: toma las filas de `_MOVIMIENTOS` que CAJA
// publica como "DEUDA ATRASADA Y DEL MES" y le pone a cada una el veredicto del extracto.
//
// ═══ POR QUÉ EXISTE (17/08/2026) ═══
//
// El dueño: *"«deuda atrasada y del mes» estando a 17 de agosto, no puede ser ese el monto, tenés q
// revisar todas las pestañas y todos los conceptos para ver si están pagados"*. Tenía razón: el
// F931 de julio ($7.074.772) figuraba impago con el pago de ARCA ya debitado el 11/08.
//
// El criterio vive en `lib/libro-cruce-banco.mjs` y lo usan LOS DOS: el libro para decidir el
// estado, y este script para mostrar la evidencia. Una sola definición — si mañana cambia la regla,
// cambian los dos juntos. Escrito dos veces, la tabla y el libro podrían decir cosas distintas.
//
//   node orquestador/scripts/deuda-evidencia-pago.mjs
//   node orquestador/scripts/deuda-evidencia-pago.mjs --hasta 2026-09-30

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { debitosDelExtracto, corteDelExtracto } from '../lib/libro-respaldo-banco.mjs'
import { cruzarLibroContraBanco, VEREDICTO_CRUCE, GRITAN_CRUCE } from '../lib/libro-cruce-banco.mjs'
import { isoDeSerial } from '../lib/libro-extractores-fechas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = '_MOVIMIENTOS'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const pesos = (n) => (n === null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`)
const fecha = (s) => (num(s) === null ? '—' : isoDeSerial(s))

/** Serial de Sheets de una fecha ISO. La época de Sheets es el 30/12/1899. */
export const serialDe = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse('1899-12-30T00:00:00Z')) / 86400000)

/**
 * HASTA DÓNDE LLEGA "Y DEL MES" — el último día del mes en curso, DERIVADO y no tipeado.
 *
 * Es el mismo corte que usa la tarjeta de CAJA. Un serial escrito a mano se queda viejo el 1° del
 * mes siguiente y la tabla empieza a contar otra cosa que el cuadro, sin dar un error.
 */
export function finDelMes(hoy = new Date()) {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + 1, 0))
  return serialDe(d.toISOString().slice(0, 10))
}

/** Las columnas de `_MOVIMIENTOS`, en el orden que escribe `libro-movimientos-pestana.mjs`. */
const COL = { fecha: 0, signo: 1, importe: 2, concepto: 4, rubro: 5, estado: 7, instrumento: 8, contraparte: 9, pestana: 13, origen: 14 }

/** NÚCLEO: las filas del libro publicado que la tarjeta cuenta como deuda. */
export function deudaPublicada(filas, hasta) {
  const out = []
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const m = {
      fecha: num(f[COL.fecha]), signo: num(f[COL.signo]), importe: num(f[COL.importe]),
      concepto: txt(f[COL.concepto]), rubro: txt(f[COL.rubro]), estado: txt(f[COL.estado]),
      instrumento: txt(f[COL.instrumento]), contraparte: txt(f[COL.contraparte]),
      pestana: txt(f[COL.pestana]), origen: txt(f[COL.origen]), filaSheet: i + 1,
    }
    if (m.fecha === null || m.importe === null || m.signo !== -1) continue
    if (m.estado !== 'COMPROMETIDO' && m.estado !== 'VENCIDO') continue
    if (m.fecha > hasta) continue
    out.push(m)
  }
  return out.sort((a, b) => a.fecha - b.fecha)
}

/** El rótulo de una línea, ancho fijo, para que la tabla se lea en una terminal. */
function tabla(enc, cuerpo, derecha = new Set()) {
  const ancho = enc.map((_, c) => Math.max(enc[c].length, ...cuerpo.map((f) => String(f[c]).length)))
  const linea = (f) => f.map((v, c) => (derecha.has(c) ? String(v).padStart(ancho[c]) : String(v).padEnd(ancho[c]))).join('  ')
  console.log(linea(enc))
  console.log(ancho.map((a) => '─'.repeat(a)).join('  '))
  for (const f of cuerpo) console.log(linea(f))
}

async function main() {
  const argHasta = process.argv.indexOf('--hasta')
  const hasta = argHasta > 0 ? serialDe(process.argv[argHasta + 1]) : finDelMes()

  const google = makeGoogleClient({ config: loadConfig() })
  const leer = (r) => google.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })
  const [mov, banco] = await Promise.all([leer(`${PESTAÑA}!A1:Q`), leer('_BANCO_RAW!A1:F')])

  const debitos = debitosDelExtracto(banco)
  const corte = corteDelExtracto(banco)
  const desdeExtracto = debitos.reduce((a, d) => (a === null || d.fecha < a ? d.fecha : a), null)
  const filas = deudaPublicada(mov, hasta)
  const total = filas.reduce((a, m) => a + m.importe, 0)

  console.log('EVIDENCIA DE PAGO — «DEUDA ATRASADA Y DEL MES», todas las pestañas')
  console.log(`  extracto _BANCO_RAW: del ${fecha(desdeExtracto)} al ${fecha(corte)} · ${debitos.length} débitos`)
  console.log(`  deuda publicada hasta el ${fecha(hasta)}: ${filas.length} fila(s) · ${pesos(total)}`)
  console.log('  ⚠ ESTE SCRIPT NO ESCRIBE. Muestra el veredicto; el libro lo aplica al regenerarse.\n')

  const r = cruzarLibroContraBanco(filas, debitos, { corte, desdeExtracto })

  tabla(
    ['f', 'vence', 'importe', 'estado', 'rubro', 'origen', 'concepto', 'veredicto', 'el banco dice'],
    filas.map((m, i) => {
      const v = r.veredictos.get(i) ?? { veredicto: '—', motivo: '' }
      return [
        m.filaSheet, fecha(m.fecha), pesos(m.importe), m.estado, m.rubro.slice(0, 26),
        m.pestana.slice(0, 20), m.concepto.slice(0, 40), v.veredicto,
        v.veredicto === VEREDICTO_CRUCE.banco ? `${pesos(v.cubierto)} el ${fecha(v.fecha)}` : '—',
      ]
    }),
    new Set([2]),
  )

  // ── EL RESUMEN POR VEREDICTO, CON PESOS. Un veredicto sin monto no mueve una decisión. ──
  console.log('')
  const porVeredicto = new Map()
  filas.forEach((m, i) => {
    const v = r.veredictos.get(i)?.veredicto ?? '—'
    if (!porVeredicto.has(v)) porVeredicto.set(v, [])
    porVeredicto.get(v).push(m)
  })
  for (const [v, ms] of [...porVeredicto].sort((a, b) => b[1].length - a[1].length)) {
    const suma = ms.reduce((a, m) => a + m.importe, 0)
    console.log(`  ${v.padEnd(17)} ${String(ms.length).padStart(2)} fila(s) · ${pesos(suma)}`)
  }

  const probadas = filas.filter((_, i) => r.veredictos.get(i)?.veredicto === VEREDICTO_CRUCE.banco)
  if (probadas.length) {
    const suma = probadas.reduce((a, m) => a + m.importe, 0)
    console.log(`\n  ✓ EL BANCO YA LAS PAGÓ — ${pesos(suma)} que la deuda no debería contar:`)
    for (const m of probadas) {
      const v = r.veredictos.get(filas.indexOf(m))
      console.log(`    · f${m.filaSheet} ${m.concepto.slice(0, 44)} ${pesos(m.importe)} — ${v.motivo}`)
    }
    console.log(`    → deuda publicada ${pesos(total)} · deuda real ${pesos(total - suma)}`)
  }

  const gritan = filas.filter((_, i) => GRITAN_CRUCE.includes(r.veredictos.get(i)?.veredicto))
  if (gritan.length) {
    const suma = gritan.reduce((a, m) => a + m.importe, 0)
    console.log(`\n  ⚠ SIN PRUEBA — el libro las cuenta como deuda (${pesos(suma)}) y el extracto no las confirma:`)
    for (const m of gritan) {
      const v = r.veredictos.get(filas.indexOf(m))
      console.log(`    · f${m.filaSheet} ${m.concepto.slice(0, 44)} ${pesos(m.importe)} — ${v.motivo}`)
    }
  }

  // LO QUE EL BANCO PAGÓ Y NINGUNA OBLIGACIÓN EXPLICA. Es el otro lado del mismo agujero: un
  // concepto que sale de la cuenta y no está cargado en ninguna pestaña.
  if (r.sobrantes.length) {
    console.log('\n  ⚠ EL BANCO PAGÓ DE MÁS — ninguna obligación del libro explica esta plata:')
    for (const s of r.sobrantes) {
      console.log(`    · ${pesos(s.sobrante)} de ${s.naturaleza} el ${fecha(s.fecha)} (_BANCO_RAW f${s.fila})`)
    }
    console.log('    → falta cargar ese concepto en su pestaña, o la proyección quedó corta.')
  }

  // EL LÍMITE, AL LADO DEL NÚMERO. Sobre lo anterior al extracto este script NO puede opinar, y
  // decir "impago" sería inventar. Se dice acá, donde se lee el resultado.
  console.log(`\n  LÍMITE: el extracto cubre del ${fecha(desdeExtracto)} al ${fecha(corte)}. Sobre un vencimiento`)
  console.log('  anterior o posterior a esa ventana ninguna fila de esta tabla prueba nada.')
}

// Las dos funciones puras se exportan para que un test las mida sin red (`deuda-evidencia.test.mjs`),
// y `main()` sólo corre cuando el script se invoca de verdad. Sin esta guarda, importarlo para
// probarlo dispararía una lectura de Google.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
