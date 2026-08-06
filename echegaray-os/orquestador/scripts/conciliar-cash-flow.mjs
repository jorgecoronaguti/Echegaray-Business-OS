#!/usr/bin/env node
// CONCILIAR LOS DOS CASH FLOWS LÍNEA POR LÍNEA CONTRA SU FUENTE — SOLO LECTURA, nunca escribe.
//
// EL PEDIDO (04/08): "máxima certeza en ambos cash flows, revisá todo el sheet para conciliar cada
// valor". No es una revisión: es una afirmación defendible por línea — de dónde sale, contra qué se
// comprobó, y si cerró o no.
//
// CÓMO. Cada línea se rehace desde la PESTAÑA DE ORIGEN con código propio (lib/cash-flow-mapa.mjs) y
// se compara contra la celda. Nunca se reusa la fórmula de la celda: una fórmula no se verifica
// consigo misma. Lo que no se puede rehacer desde una fuente se declara `derivada` y se dice.
//
// EL CUADRO SE MUEVE SOLO. Las proyecciones usan TODAY(), así que el mismo archivo da otro número
// mañana. Por eso todo lo que sale de acá lleva el instante en que se leyó.
//
//   node orquestador/scripts/conciliar-cash-flow.mjs            # las dos pestañas
//   node orquestador/scripts/conciliar-cash-flow.mjs --semanal  # sólo el semanal
//
// Sale con 1 si alguna línea de fuente no concilia dentro de la tolerancia.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  inicioMesSiguiente, serialDeFecha, serialAMes,
  cobradasConFechaFutura, pendientesFueraDeVentana, ritmoMensual,
} from '../lib/cash-flow-conciliacion.mjs'
import { LINEAS, SUBTOTALES, impuestoAlChequeDeColumna } from '../lib/cash-flow-mapa.mjs'
import {
  columnasDePeriodo, mesDeSerial, cadenaDeCaja, subtotales, totalAnual, semanasPorMes, cuadreDeFila,
} from '../lib/cash-flow-invariantes.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const TOL = 1 // un peso: por debajo es redondeo del propio Sheet, por encima es un hallazgo
const ANIO = 2026

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const $ = (n) => (Math.abs(n) < 0.5 ? '—' : Math.round(n).toLocaleString('es-AR'))
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

async function leer(google) {
  const v = (r) => google.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' })
  const leido = new Date()
  const [men, sem, compras, cobranzas, cheques, tarjeta, banco, impuestos, jor, caja] = await Promise.all([
    v(`'Cash Flow Mensual'!A1:P70`), v(`'Cash Flow Semanal'!A1:BZ70`), v(`'Compras'!A1:AJ2000`),
    v(`'Cobranzas'!A1:BD400`), v(`'Cheques Emitidos'!A1:P400`), v(`'Tarjeta de Credito'!A1:N400`),
    // "Impuestos y Financieros" hasta la 120, no hasta la 40 (06/08). El rango cortaba en la fila 40
    // y dejaba INVISIBLES los bloques de planes, deuda financiera, gaps y parámetros — que ya vivían
    // más abajo. Con la reconstrucción (posición y calendario ARRIBA del detalle) el corte se llevaba
    // puestas también las dos filas del calendario fiscal, que ahora están cerca de la 50: la
    // conciliación habría leído `undefined` y declarado $0 de IVA sin un solo error.
    v(`'_BANCO_RAW'!A1:H3000`), v(`'Impuestos y Financieros'!A1:O120`), v(`'Jornales por Quincena'!A1:P110`),
    v(`'CAJA'!A1:J40`),
  ])
  // Los rangos con nombre del bloque de jornales, resueltos a filas con sus campos con nombre.
  const tramo = (desde, hasta, campos) => jor.slice(desde - 1, hasta).map((f) => {
    const o = {}
    for (const [k, c] of Object.entries(campos)) o[k] = (f || [])[c]
    return o
  })
  return {
    leido,
    men,
    sem,
    fuentes: {
      compras,
      cobranzas,
      cheques,
      tarjeta,
      banco,
      impuestos,
      jornalesReales: tramo(86, 99, { hasta: 1, pago: 2, total: 10, pagado: 13 }), // B·C·K·N
      jornalesProy: tramo(13, 22, { hasta: 1, pago: 2, total: 7 }), // B·C·H
      oficina: tramo(28, 39, { pagado: 2, pago: 4, proyectado: 7 }), // C·E·H
      direccion: tramo(53, 64, { pagado: 2, pago: 4, proyectado: 7 }),
    },
    caja,
  }
}

/** La fila del rótulo, verificada. Si el esqueleto cambió, se dice en vez de comparar otra cosa. */
function filaDe(grid, fila, concepto) {
  const rotulo = norm((grid[fila - 1] || [])[0])
  const esperado = norm(concepto).slice(0, 20)
  return rotulo.startsWith(esperado.slice(0, 12)) || rotulo.includes(esperado.slice(0, 12)) ? fila : null
}

function ventanaDe(pestana, serial) {
  return pestana === 'mensual'
    ? { desde: serial, hasta: inicioMesSiguiente(serial), anio: ANIO }
    : { desde: serial, hasta: serial + 7, anio: ANIO }
}

/**
 * Concilia una pestaña entera: cada línea de fuente, en cada período.
 *
 * UN DESVÍO EN UN MES FUTURO NO ES UN DEFECTO: el cuadro proyecta a propósito lo que todavía no
 * pasó, y la fuente todavía no tiene esas filas. Se separan los dos, porque mezclarlos convierte
 * $140M de proyección declarada en "$140M que no concilian" y eso es exactamente el ruido que hace
 * que un informe no se pueda usar para decidir.
 */
function conciliar(pestana, grid, fuentes, cols, inicioMesActual) {
  const filas = []
  for (const linea of LINEAS) {
    if (linea.tipo !== 'fuente') continue
    const f = grid[linea.fila - 1] || []
    const rotuloOk = filaDe(grid, linea.fila, linea.concepto) !== null
    let celdaAnio = 0
    let recAnio = 0
    const desvios = []
    for (const { col, serial } of cols) {
      const celda = num(f[col])
      const r = linea.calc(fuentes, ventanaDe(pestana, serial))
      celdaAnio += celda
      recAnio += r.total
      const dif = celda - r.total
      const futuro = serial >= inicioMesSiguiente(inicioMesActual)
      if (Math.abs(dif) > TOL) desvios.push({ col, serial, celda, reconstruido: r.total, dif, futuro })
    }
    // UNA COMPUERTA DECLARADA NO ES UN DEFECTO DE TRANSCRIPCIÓN. Las líneas de cobranzas esperadas
    // apagan a propósito los meses ya pasados; la reconstrucción no aplica esa compuerta para que la
    // plata que se cae quede a la vista, pero la diferencia se informa como compuerta, no como error.
    const cerrados = desvios.filter((d) => !d.futuro && !linea.compuerta)
    filas.push({
      ...linea,
      pestana,
      rotuloOk,
      celdaAnio,
      recAnio,
      difAnio: celdaAnio - recAnio,
      desvios,
      cerrados,
      difCerrados: cerrados.reduce((a, d) => a + d.dif, 0),
      difProyeccion: desvios.filter((d) => d.futuro).reduce((a, d) => a + d.dif, 0),
    })
  }
  return filas
}

/**
 * EL MES EN CURSO SE TRATA COMO CERRADO. La condición de todas las líneas proyectadas es
 * `EOMONTH(mes) <= EOMONTH(TODAY())`, y el mes de hoy la cumple: el cuadro muestra lo cargado hasta
 * hoy como si fuera el mes entero. Al día 4 de un mes de 31, eso no es un dato, es un cuarto de dato.
 */
function imprimirMesEnCurso(men, colsMen, fuentes, inicioMesActual, hoy) {
  const { dia } = serialAMes(hoy)
  const dias = inicioMesSiguiente(inicioMesActual) - inicioMesActual
  const col = colsMen.find((c) => c.serial === inicioMesActual)
  if (!col) return
  console.log(`\n\n═══ EL MES EN CURSO · día ${dia} de ${dias} ═══`)
  console.log(`  El cuadro da el mes por cerrado. Comparación contra el RITMO de los 3 meses cerrados anteriores`)
  console.log(`  (mismo modelo con el que el propio cuadro proyecta septiembre a diciembre) — es PROYECCIÓN, no un dato.`)
  console.log('  fila  concepto'.padEnd(52) + 'CARGADO'.padStart(16) + 'RITMO 3M'.padStart(16) + 'FALTARÍA'.padStart(16))
  let falta = 0
  for (const l of LINEAS) {
    if (l.tipo !== 'fuente' || !l.rubro && !l.subrubroInv) continue
    const r = ritmoMensual(fuentes.compras, { rubro: l.rubro, subrubro: l.subrubroInv, inicioMesActual })
    const celda = num((men[l.fila - 1] || [])[col.col])
    const brecha = r.promedio - celda
    if (brecha <= TOL) continue
    falta += brecha
    console.log(`  ${String(l.fila).padStart(4)}  ${l.concepto.slice(0, 44).padEnd(44)}${$(celda).padStart(16)}${$(r.promedio).padStart(16)}${$(brecha).padStart(16)}`)
  }
  console.log(`  ${''.padEnd(50)}${'TOTAL'.padStart(16)}${$(falta).padStart(30)}`)
}

function imprimirTabla(titulo, filas) {
  console.log(`\n${titulo}`)
  console.log('  fila  concepto'.padEnd(56) + 'CELDA (año)'.padStart(17) + 'RECONSTRUIDO'.padStart(17) + 'DIFERENCIA'.padStart(16) + '  veredicto')
  for (const f of filas) {
    const ok = Math.abs(f.difAnio) <= TOL && f.desvios.length === 0
    const soloFuturo = f.desvios.length && !f.cerrados.length
    const veredicto = !f.rotuloOk ? '⛔ la fila no es la que dice el mapa'
      : ok ? '✓ concilia'
        : f.compuerta ? '◑ concilia salvo lo que apaga la compuerta declarada'
          : soloFuturo ? `◐ concilia lo cerrado · ${f.desvios.length} mes(es) futuros son proyección`
            : `✗ ${f.cerrados.length} período(s) CERRADOS fuera`
    console.log(`  ${String(f.fila).padStart(4)}  ${f.concepto.slice(0, 48).padEnd(48)}`
      + `${$(f.celdaAnio).padStart(17)}${$(f.recAnio).padStart(17)}${$(f.difAnio).padStart(16)}  ${veredicto}`)
  }
}

function imprimirDesvios(filas, etiqueta) {
  const conDesvio = filas.filter((f) => f.desvios.length)
  if (!conDesvio.length) return
  console.log(`\n  el detalle de lo que no cierra (${etiqueta}) — período · celda · reconstruido · diferencia`)
  for (const f of conDesvio) {
    console.log(`   · fila ${f.fila} ${f.concepto}  [fuente: ${f.fuente} · ${f.criterio}]`)
    for (const d of f.desvios.slice(0, 14)) {
      const m = mesDeSerial(d.serial)
      console.log(`       ${String(m.dia ?? '').padStart(0)}${String(m.mes).padStart(2, '0')}/${m.anio}  serial ${d.serial}  `
        + `${$(d.celda).padStart(15)} ${$(d.reconstruido).padStart(15)} ${$(d.dif).padStart(15)}`)
    }
    if (f.desvios.length > 14) console.log(`       … y ${f.desvios.length - 14} período(s) más`)
  }
}

function imprimirInvariantes(men, sem, colsMen, colsSem) {
  console.log('\n\n═══ INVARIANTES ═══')
  const bloques = [
    ['cadena de caja · mensual · inicio + neto = cierre y cierre(n) = inicio(n+1)', cadenaDeCaja(men[53], men[52], men[54], colsMen, TOL)],
    ['cadena de caja · semanal', cadenaDeCaja(sem[53], sem[52], sem[54], colsSem, TOL)],
    ['subtotal = suma de sus componentes · mensual', subtotales(men, SUBTOTALES, colsMen, TOL)],
    ['subtotal = suma de sus componentes · semanal', subtotales(sem, SUBTOTALES, colsSem, TOL)],
    ['total del año = suma de los períodos · mensual', totalAnual(men, LINEAS, colsMen, 13, TOL)],
  ]
  let fallas = 0
  for (const [nombre, r] of bloques) {
    fallas += r.length
    console.log(`  ${r.length ? '✗' : '✓'} ${nombre}${r.length ? ` — ${r.length} falla(s)` : ''}`)
    for (const f of r.slice(0, 8)) {
      console.log(`      ${f.tipo || f.concepto || ''} · fila ${f.fila ?? ''} · col ${f.col ?? ''} · celda ${$(f.celda)} vs esperado ${$(f.esperado)} → ${$(f.diferencia)}`)
    }
  }
  // El impuesto al cheque es derivado del propio cuadro: se rehace con las mismas celdas y se declara.
  let malChe = 0
  for (const { col } of colsMen) {
    if (Math.abs(num((men[45] || [])[col]) - impuestoAlChequeDeColumna(men, col)) > TOL) malChe++
  }
  console.log(`  ${malChe ? '✗' : '✓'} impuesto al cheque = 0,6% de sus componentes · mensual${malChe ? ` — ${malChe} mes(es)` : ''} (línea DERIVADA: se valida contra el propio cuadro)`)
  return fallas + malChe
}

function imprimirCuadre(men, sem, colsMen, colsSem) {
  const { porMes, cruzadas } = semanasPorMes(colsSem, ANIO)
  console.log('\n\n═══ MENSUAL vs SEMANAL · por línea y por mes ═══')
  console.log(`  ${cruzadas.length} semana(s) cruzan el fin de mes y se asignan al mes de su lunes — su diferencia es de convención`)
  console.log('  fila  concepto'.padEnd(52) + 'MENSUAL'.padStart(16) + 'SEMANAL'.padStart(16) + 'BRECHA AÑO'.padStart(16))
  const brechas = []
  for (const l of LINEAS) {
    if (l.noSuma) continue
    const r = cuadreDeFila(men[l.fila - 1] || [], sem[l.fila - 1] || [], colsMen, porMes)
    if (Math.abs(r.diferenciaAnio) <= TOL) continue
    brechas.push({ ...l, ...r })
    console.log(`  ${String(l.fila).padStart(4)}  ${l.concepto.slice(0, 44).padEnd(44)}`
      + `${$(r.mensualAnio).padStart(16)}${$(r.semanalAnio).padStart(16)}${$(r.diferenciaAnio).padStart(16)}`)
  }
  for (const b of brechas) {
    const meses = b.meses.filter((m) => Math.abs(m.diferencia) > TOL)
    if (!meses.length) continue
    console.log(`   · fila ${b.fila} ${b.concepto} — por mes:`)
    console.log('       ' + meses.map((m) => `${String(m.mes).padStart(2, '0')}: ${$(m.diferencia)}`).join(' · '))
  }
  return brechas
}

/**
 * DEFECTOS DE CRITERIO. Acá el número está bien traído de la fuente: la conciliación de arriba da
 * verde. Lo que está mal es el dato de origen o la compuerta que lo deja afuera — y ninguna
 * conciliación de fórmula puede verlo, porque las dos puntas dicen lo mismo.
 */
function imprimirCriterio(fuentes, hoy, inicioMesActual) {
  console.log('\n\n═══ DEFECTOS DE CRITERIO (la fórmula está bien; el dato no) ═══')
  const futuras = cobradasConFechaFutura(fuentes.cobranzas, hoy)
  const fuera = pendientesFueraDeVentana(fuentes.cobranzas, inicioMesActual)
  console.log(`  ✗ "Cobrado" con fecha de cobro FUTURA — el cuadro lo cuenta como percibido: $${$(futuras.total)}`)
  for (const c of futuras.casos) console.log(`      ${c.cliente.slice(0, 40).padEnd(40)} $${$(c.monto).padStart(14)}  cobro serial ${c.fecha}`)
  console.log(`  ✗ Pendiente con fecha anterior al mes en curso — no está en cobrado ni en esperado: $${$(fuera.total)}`)
  for (const c of fuera.casos) console.log(`      ${c.cliente.slice(0, 40).padEnd(40)} $${$(c.monto).padStart(14)}  cobro serial ${c.fecha} (${c.estado})`)
  return futuras.total + fuera.total
}

/**
 * EL SOLAPE DEL ANCLA. El saldo inicial del período en curso es el saldo de HOY, pero el neto que se
 * le suma es el del período ENTERO — incluidos los días que ya pasaron y que ese saldo ya refleja.
 * Lo que cayó entre el 1° y hoy se cuenta dos veces. No se afirma el monto del error: se mide cuánta
 * plata está expuesta a él, que es lo que hay que mirar antes de confiar en el saldo proyectado.
 */
function imprimirSolape(fuentes, inicioMesActual, hoy) {
  const v = { desde: inicioMesActual, hasta: hoy + 1, anio: ANIO }
  let entra = 0
  let sale = 0
  for (const l of LINEAS) {
    if (l.tipo !== 'fuente' || l.noSuma) continue
    const t = l.calc(fuentes, v).total
    if (l.fila <= 13) entra += t
    else sale += t
  }
  console.log('\n\n═══ SOLAPE DEL ANCLA (riesgo de doble conteo) ═══')
  console.log(`  El ancla es el saldo al día de hoy; el neto del período en curso incluye los días ya transcurridos.`)
  console.log(`  Movimientos con fecha entre el 1° del mes y hoy: entra $${$(entra)} · sale $${$(sale)} · neto $${$(entra - sale)}`)
  console.log(`  Si el saldo de CAJA ya los refleja, ese neto está contado dos veces en el cierre proyectado.`)
  return entra - sale
}

async function main() {
  const soloSemanal = process.argv.includes('--semanal')
  const google = makeGoogleClient({ config: loadConfig() })
  const { leido, men, sem, fuentes, caja } = await leer(google)
  const colsMen = columnasDePeriodo(men[2] || [])
  const colsSem = columnasDePeriodo(sem[2] || [])

  const hoy = serialDeFecha(leido.getFullYear(), leido.getMonth() + 1, leido.getDate())
  const inicioMesActual = serialDeFecha(leido.getFullYear(), leido.getMonth() + 1, 1)

  console.log('CONCILIACIÓN DEL CASH FLOW · SOLO LECTURA')
  console.log(`Leído el ${leido.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })} `
    + `(el cuadro proyecta con TODAY() y se recalcula solo: cualquier cifra de acá vale para ESE instante)`)
  console.log(`Períodos: ${colsMen.length} mensuales · ${colsSem.length} semanales · tolerancia $${TOL}`)
  console.log(`Ancla de caja: CAJA!E23 = $${$(num((caja[22] || [])[4]))} al serial ${num((caja[22] || [])[5])} · hoy = serial ${hoy}`)

  const filasMen = soloSemanal ? [] : conciliar('mensual', men, fuentes, colsMen, inicioMesActual)
  const filasSem = conciliar('semanal', sem, fuentes, colsSem, inicioMesActual)
  if (!soloSemanal) { imprimirTabla('═══ CASH FLOW MENSUAL ═══', filasMen); imprimirDesvios(filasMen, 'mensual') }
  imprimirTabla('═══ CASH FLOW SEMANAL ═══', filasSem)
  imprimirDesvios(filasSem, 'semanal')
  const fallasInv = imprimirInvariantes(men, sem, colsMen, colsSem)
  const brechas = soloSemanal ? [] : imprimirCuadre(men, sem, colsMen, colsSem)
  if (!soloSemanal) imprimirMesEnCurso(men, colsMen, fuentes, inicioMesActual, hoy)
  const solape = imprimirSolape(fuentes, inicioMesActual, hoy)
  const criterio = imprimirCriterio(fuentes, hoy, inicioMesActual)

  const todas = [...filasMen, ...filasSem]
  const rotas = todas.filter((f) => f.cerrados.length)
  const proyectadas = todas.filter((f) => !f.cerrados.length && f.desvios.length)
  const plataRota = rotas.reduce((a, f) => a + Math.abs(f.difCerrados), 0)
  const derivadas = LINEAS.filter((l) => l.tipo === 'derivada')
  console.log('\n\n═══ RESUMEN ═══')
  console.log(`  líneas de fuente conciliadas EN LOS PERÍODOS CERRADOS   ${todas.length - rotas.length} de ${todas.length}`)
  console.log(`  líneas que NO concilian en un período cerrado           ${rotas.length}`
    + `${rotas.length ? ' → ' + rotas.map((m) => `${m.pestana} f${m.fila} (${$(m.difCerrados)})`).join(' · ') : ''}`)
  console.log(`  plata en juego en lo que NO concilia                    $${$(plataRota)}`)
  console.log(`  líneas que sólo difieren en meses FUTUROS (proyección declarada, no defecto)  ${proyectadas.length}`
    + ` · $${$(proyectadas.reduce((a, f) => a + f.difProyeccion, 0))}`)
  console.log(`  invariantes con falla                                  ${fallasInv}`)
  const neto = brechas.find((b) => b.fila === 53)
  console.log(`  brecha mensual vs semanal                              ${brechas.length} línea(s) · `
    + `$${$(neto ? neto.diferenciaAnio : 0)} en el AUMENTO NETO DEL EFECTIVO del año`)
  console.log(`  neto del período en curso expuesto a doble conteo con el ancla   $${$(solape)}`)
  console.log(`  defectos de CRITERIO (el número está bien traído, el dato no debería estar ahí)  $${$(criterio)}`)
  console.log(`  líneas DERIVADAS (no se concilian contra una fuente externa): ${derivadas.map((d) => d.fila).join(', ')}`)
  process.exit(rotas.length || criterio > TOL ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
}
