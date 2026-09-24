#!/usr/bin/env node
// AUDITORÍA RENGLÓN POR RENGLÓN: ¿EL CASH FLOW SEMANAL Y EL MENSUAL MUESTRAN LO QUE DICE EL LIBRO?
//
// Pedido del dueño (24/09/2026): «tenés que auditar que las pestañas de cash flow semanal y mensual
// estén reflejando bien todo, porque voy a tocar las pestañas de nómina, cargas sociales e impuestos».
//
// Un control nunca se valida contra la misma información que produce: acá NO se leen las fórmulas del
// Sheet para creerles. Se relee `_MOVIMIENTOS` (valores ya calculados, incluidas las fórmulas vivas
// que apuntan a Nómina) y se RECALCULA en código cada celda de cada renglón por rubro de las dos
// vistas, con la misma regla que declaran sus encabezados:
//   · real       = Σ movimientos REAL del período y del rubro
//   · proyectado = Σ PROYECTADO + COMPROMETIDO del período, + los VENCIDOS en el período que contiene
//                  la fecha del saldo (CAJA_FECHA_SALDO)
// y se compara contra lo que la vista muestra. Sólo lee.
//
//   node orquestador/scripts/auditar-cash-flow-contra-libro.mjs
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')
const iso = (s) => new Date(Date.UTC(1899, 11, 30) + s * 86400000).toISOString().slice(0, 10)

const serial = (y, m, d) => Math.round((Date.UTC(y, m, d) - Date.UTC(1899, 11, 30)) / 86400000)
const fechaDe = (s) => new Date(Date.UTC(1899, 11, 30) + s * 86400000)

/** El fin (exclusivo) del período que empieza en `d`: mes calendario o semana. */
const finMes = (d) => { const f = fechaDe(d); return serial(f.getUTCFullYear(), f.getUTCMonth() + 1, 1) }

/**
 * Las columnas de período de una vista —las celdas de la cabecera (fila 7) que son fecha— y la columna
 * TOTAL, la que dice «TOTAL…». Cada período sabe si está a la izquierda del TOTAL (el ejercicio) o a
 * su derecha (el año siguiente, desde el 24/09/2026): la semana del 28/12 aparece a los dos lados.
 */
function columnasDe(grilla) {
  const cab = grilla[6] ?? []
  const jTotal = cab.findIndex((v) => /^TOTAL/i.test(String(v ?? '').trim()))
  const cols = cab.map((v, j) => (typeof v === 'number' && v > 40000 ? { j, d: v, siguiente: jTotal >= 0 && j > jTotal } : null)).filter(Boolean)
  return { cols, jTotal }
}

/** Lo esperado para un rubro en [desde, hasta), con la misma regla que declaran los encabezados. */
function esperadoDe(libro, { rubro, real, entra }, { desde: d, hasta }, fechaSaldo) {
  let esperado = 0
  for (const m of libro) {
    if (m.rubro !== rubro) continue
    // Los renglones de INGRESOS cuentan sólo lo que entra (su fórmula filtra signo +1); los de
    // egresos, todo el rubro con su signo — igual que la vista.
    if (entra && m.signo !== 1) continue
    const enPeriodo = m.fecha >= d && m.fecha < hasta
    if (real) { if (enPeriodo && m.estado === 'REAL') esperado += m.signo * m.importe; continue }
    if (enPeriodo && (m.estado === 'PROYECTADO' || m.estado === 'COMPROMETIDO')) esperado += m.signo * m.importe
    if (m.estado === 'VENCIDO' && d <= fechaSaldo && hasta > fechaSaldo) esperado += m.signo * m.importe
  }
  return entra ? esperado : -esperado
}

/**
 * `ventana(col)` → [desde, hasta) de una columna. La del Semanal se RECORTA a su año: a la izquierda
 * del TOTAL, al ejercicio (la primera semana arranca el lunes 29/12 del año anterior y la del 28/12
 * corta en el 31/12); a la derecha, del 1/1 del año siguiente al último día que muestran las vistas.
 *
 * Y EL TOTAL TAMBIÉN SE AUDITA contra el libro sumado sobre el EJERCICIO (`total`): es la prueba de que
 * «TOTAL 2026» no se lleva un peso de 2027, que es lo que pidió el dueño el 24/09/2026.
 */
function auditar(nombre, grilla, libro, fechaSaldo, ventana, total) {
  const { cols, jTotal } = columnasDe(grilla)
  let seccion = null
  const fallas = []
  let celdas = 0
  grilla.forEach((r, i) => {
    const rot = String(r?.[0] ?? '').trim()
    if (/^(Ingresos|Egresos) (reales|proyectados)$/.test(rot)) { seccion = rot; return }
    if (/^(Variación|Saldo final|Por cliente)/.test(rot)) { seccion = null; return }
    if (!seccion || !rot.startsWith('· ') || rot === '· Otros') return
    const q = { rubro: rot.slice(2), real: /reales/.test(seccion), entra: /^Ingresos/.test(seccion) }
    const mirar = [...cols.map((c) => ({ j: c.j, periodo: iso(c.d) + (c.siguiente ? ' (año sig.)' : ''), v: ventana(c) }))]
    if (jTotal >= 0) mirar.push({ j: jTotal, periodo: 'TOTAL', v: total })
    for (const { j, periodo, v } of mirar) {
      const esperado = esperadoDe(libro, q, v, fechaSaldo)
      const visto = Number(r[j]) || 0
      celdas++
      if (Math.abs(visto - esperado) >= 1) fallas.push({ fila: i + 1, rubro: q.rubro, seccion, periodo, visto, esperado })
    }
  })
  if (jTotal < 0) { console.log(`\n✗ ${nombre}: no encontré la columna TOTAL en la cabecera`); fallas.push({}) }
  const nSig = cols.filter((c) => c.siguiente).length
  console.log(`\n${nombre}: ${cols.length} período(s)${cols.length ? `, ${iso(cols[0].d)} a ${iso(cols.at(-1).d)}` : ''}`
    + ` (${nSig} después del TOTAL) · ${celdas} celda(s) de rubro auditadas, TOTAL incluido · ${fallas.length} no coinciden con el libro`)
  for (const f of fallas.slice(0, 40)) console.log(`  ✗ f${f.fila} ${f.seccion} · ${f.rubro} · ${f.periodo}: muestra ${pesos(f.visto)}, el libro da ${pesos(f.esperado)}`)
  return fallas.length
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const [mov, men, sem, fs] = await Promise.all([
    google.readSheetValues(ID, "'_MOVIMIENTOS'!A2:H", { render: 'UNFORMATTED_VALUE' }),
    // HASTA LA BZ Y NO HASTA UNA LETRA TIPEADA: las columnas de período se reconocen por su fecha en
    // la cabecera, y el ancho de las vistas cambió el 24/09/2026 (Mensual 13 meses, Semanal 57 semanas).
    google.readSheetValues(ID, "'Cash Flow Mensual'!A1:BZ60", { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, "'Cash Flow Semanal'!A1:BZ60", { render: 'UNFORMATTED_VALUE' }),
    google.readSheetValues(ID, 'CAJA_FECHA_SALDO', { render: 'UNFORMATTED_VALUE' }),
  ])
  const libro = (mov ?? []).filter((r) => typeof r[0] === 'number' && Number.isFinite(Number(r[2])))
    .map((r) => ({ fecha: r[0], signo: Number(r[1]), importe: Number(r[2]), rubro: String(r[5] ?? ''), estado: String(r[7] ?? '') }))
  const fechaSaldo = Number(fs?.[0]?.[0])
  console.log(`libro: ${libro.length} movimiento(s) · saldo al ${iso(fechaSaldo)}`)
  // EL HORIZONTE SALE DE LO QUE LAS VISTAS MUESTRAN, no de una fecha tipeada: del primer día del
  // primer mes al día siguiente al último del último mes del Mensual. El ejercicio es el año del primero.
  const { cols: colsMen } = columnasDe(men)
  if (!colsMen.length) throw new Error('no encontré las columnas de mes del Cash Flow Mensual (fila 7)')
  const inicio = colsMen[0].d
  const fin = finMes(colsMen.at(-1).d)
  const finAnio = serial(fechaDe(inicio).getUTCFullYear() + 1, 0, 1)
  const total = { desde: inicio, hasta: finAnio }
  const a = auditar('Cash Flow Mensual', men, libro, fechaSaldo, (c) => ({ desde: c.d, hasta: finMes(c.d) }), total)
  const b = auditar('Cash Flow Semanal', sem, libro, fechaSaldo, (c) => (c.siguiente
    ? { desde: Math.max(c.d, finAnio), hasta: Math.min(c.d + 7, fin) }
    : { desde: Math.max(c.d, inicio), hasta: Math.min(c.d + 7, finAnio) }), total)
  // Y LAS DOS VISTAS TIENEN QUE TERMINAR EN EL MISMO DÍA: si el Semanal se cortara antes que el Mensual,
  // la comparación celda por celda seguiría en verde y la plata del hueco no estaría en el Semanal.
  const { cols: colsSem } = columnasDe(sem)
  const finSem = colsSem.length ? Math.min(colsSem.at(-1).d + 7, fin) : null
  if (finSem !== fin) {
    console.log(`\n✗ el Semanal termina el ${iso(finSem - 1)} y el Mensual el ${iso(fin - 1)}: no muestran el mismo período`)
    process.exitCode = 1
  }
  console.log(`\nLAS VISTAS MUESTRAN del ${iso(inicio)} al ${iso(fin - 1)}`)
  const fuera = libro.filter((m) => m.fecha >= fin && m.signo === -1 && m.estado !== 'REAL')
  if (fuera.length) {
    console.log(`HORIZONTE: ${fuera.length} egreso(s) por ${pesos(fuera.reduce((x, m) => x + m.importe, 0))} salen después del ${iso(fin - 1)} y no se ven en ninguna vista:`)
    for (const m of fuera.slice(0, 12)) console.log(`  · ${iso(m.fecha)} ${m.rubro} ${pesos(m.importe)}`)
  } else console.log(`HORIZONTE: ningún egreso pendiente sale después del ${iso(fin - 1)}`)
  if (a + b) process.exitCode = 1
  else console.log('\n✓ las dos vistas muestran exactamente lo que dice el libro, renglón por renglón')
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })
