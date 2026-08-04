#!/usr/bin/env node
// "REPASAR TODO COBRANZAS E IR VIENDO EL TEMA DE CAJA A FIN DE CADA SEMANA Y MES."
//
// POR QUÉ EXISTE (04/08/2026). El pedido textual del dueño. Dice algo preciso: el cash flow no se
// valida mirando el cash flow. Se valida contra Cobranzas —lo que se va a cobrar y cuándo— y contra
// el SALDO AL CIERRE de cada semana y de cada mes, que es el número que decide.
//
// LO QUE VERIFICA, TODO SOBRE EL ARCHIVO VIVO Y SIN ESCRIBIR UNA CELDA:
//   1. Cobranzas: pendientes sin fecha, vencidos, los que el cuadro no muestra, cobrados a futuro y
//      los indistinguibles (con la clave canónica de lib/cobranzas-duplicado.mjs).
//   2. La cadena de caja en las DOS pestañas, período por período:
//        inicio + ingresos − egresos = cierre     ·     cierre de un período = inicio del siguiente
//   3. Los dos cuadros entre sí, línea por línea, sobre el total del año.
//   4. La línea de cobranzas de cada mes, reconstruida desde Cobranzas en JavaScript.
//
// SÓLO LECTURA — ADREDE. Se construye sin WRITE_SCOPES: aunque alguien le agregue una escritura por
// error, Google la rechaza. Un auditor con permiso de escritura sobre la fuente que audita es
// exactamente el control que ya borró una pestaña entera desde un worktree.
//
//   node orquestador/scripts/repasar-cobranzas-y-caja.mjs

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { leerCobro, repasar, porMes, aFecha } from '../lib/cobranzas-en-cashflow.mjs'
import { gruposIndistinguibles } from '../lib/cobranzas-duplicado.mjs'
import { verificarCadena } from '../lib/cash-flow-ancla-saldo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ars = (n) => (n === null || n === undefined ? '—' : `$${Math.round(Number(n)).toLocaleString('es-AR')}`)
const iso = (d) => (d ? d.toISOString().slice(0, 10) : '—')
// Las filas del cuadro que este auditor necesita ubicar. Son fijas en las dos pestañas y se validan
// contra su rótulo antes de usarlas: una fila corrida daría $0 sin dar ningún error.
const FILA = { cobrado: 6, esperado: 10, variacion: 53, inicio: 54, cierre: 55 }
const ROTULO = { variacion: /AUMENTO/i, inicio: /al inicio del per/i, cierre: /al cierre del per/i }

/** Las columnas-período de una pestaña de cash flow: las de la fila 3 cuyo encabezado es una fecha. */
function columnasPeriodo(grid) {
  const cab = grid.filas[2] || []
  const out = []
  for (let j = 1; j < cab.length; j++) {
    const f = aFecha(cab[j]?.numero)
    if (f) out.push({ j, fecha: f })
  }
  return out
}

/** Comprueba que las filas del cuadro sigan donde el auditor cree. Si no, no se audita a ciegas. */
function verificarRotulos(grid, nombre) {
  for (const [k, re] of Object.entries(ROTULO)) {
    const txt = String(grid.filas[FILA[k] - 1]?.[0]?.valor ?? '')
    if (!re.test(txt)) throw new Error(`${nombre}: la fila ${FILA[k]} ya no dice "${k}" sino "${txt.slice(0, 50)}" — auditar por posición sería inventar`)
  }
}

function auditarCadena(grid, nombre) {
  verificarRotulos(grid, nombre)
  const cols = columnasPeriodo(grid)
  const val = (fila, j) => grid.filas[fila - 1]?.[j]?.numero ?? null
  const filas = cols.map(({ j, fecha }) => ({
    periodo: iso(fecha), neto: val(FILA.variacion, j), inicio: val(FILA.inicio, j), cierre: val(FILA.cierre, j),
  }))
  const r = verificarCadena(filas)
  console.log(`\n═══ ${nombre} — ${cols.length} períodos, ${filas.filter((f) => f.inicio !== null).length} con saldo`)
  if (r.cierra) console.log('   ✓ la cadena cierra: cada período con su identidad y cada cierre enganchado al siguiente')
  for (const x of r.identidad) console.log(`   ⚠ IDENTIDAD ${x.periodo}: inicio + neto − cierre = ${ars(x.diferencia)}`)
  for (const x of r.enlace) console.log(`   ⚠ ENLACE ${x.periodo}: arranca en ${ars(x.diferencia)} de diferencia contra el cierre de ${x.anterior}`)
  return { cols, filas, ...r }
}

function cruzarCuadros(cfs, cfm) {
  const totJ = (g) => (g.filas[2] || []).findIndex((c) => /^Total /.test(String(c?.valor ?? '')))
  const js = totJ(cfs), jm = totJ(cfm)
  console.log('\n═══ LOS DOS CUADROS ENTRE SÍ — total del año, línea por línea')
  if (js < 0 || jm < 0) { console.log('   ⚠ no encontré la columna "Total" en alguna de las dos'); return }
  let malas = 0
  for (let i = 0; i < 56; i++) {
    const et = String(cfs.filas[i]?.[0]?.valor ?? cfm.filas[i]?.[0]?.valor ?? '').trim()
    const s = cfs.filas[i]?.[js]?.numero, m = cfm.filas[i]?.[jm]?.numero
    if (s === null || s === undefined || m === null || m === undefined) continue
    const dif = s - m
    if (Math.abs(dif) < 1) continue
    malas++
    console.log(`   ⚠ fila ${String(i + 1).padStart(2)} ${et.slice(0, 46).padEnd(46)} semanal ${ars(s).padStart(15)}  mensual ${ars(m).padStart(15)}  dif ${ars(dif)}`)
  }
  if (!malas) console.log('   ✓ las dos pestañas dicen lo mismo en todas sus líneas')
}

function cruzarCobranzas(cobros, cfm, hoy) {
  const cols = columnasPeriodo(cfm)
  const m = porMes(cobros, { hoy })
  console.log('\n═══ LA LÍNEA DE COBRANZAS DE CADA MES, RECONSTRUIDA DESDE COBRANZAS')
  let malas = 0
  for (const { j, fecha } of cols) {
    const clave = `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
    const mio = m.get(clave) ?? { cobrado: 0, esperado: 0 }
    const cuadro = {
      cobrado: cfm.filas[FILA.cobrado - 1]?.[j]?.numero ?? 0,
      esperado: cfm.filas[FILA.esperado - 1]?.[j]?.numero ?? 0,
    }
    for (const k of ['cobrado', 'esperado']) {
      const dif = mio[k] - cuadro[k]
      if (Math.abs(dif) < 1) continue
      malas++
      console.log(`   ⚠ ${clave} ${k}: Cobranzas ${ars(mio[k])} · cuadro ${ars(cuadro[k])} · dif ${ars(dif)}`)
    }
  }
  if (!malas) console.log('   ✓ los doce meses se reconstruyen al peso desde Cobranzas')
}

async function main() {
  const hoy = new Date()
  const google = makeGoogleClient({ config: loadConfig() }) // sin WRITE_SCOPES: este auditor no escribe
  const [cob, cfs, cfm] = await Promise.all([
    google.readSheetGrid(ID, 'Cobranzas!A1:BD500'),
    google.readSheetGrid(ID, 'Cash Flow Semanal!A1:BZ120'),
    google.readSheetGrid(ID, 'Cash Flow Mensual!A1:BZ120'),
  ])

  const cobros = []
  for (let i = 4; i < cob.filas.length; i++) { const c = leerCobro(cob.filas[i], i + 1); if (c) cobros.push(c) }
  const r = repasar(cobros, { hoy })

  console.log(`═══ COBRANZAS — ${r.total} cobros por ${ars(r.montoTotal)}`)
  console.log(`   ${r.cobrados} cobrados · ${r.pendientes} pendientes por ${ars(r.montoPendiente)}`)
  const bloques = [
    ['SIN FECHA — no caen en ninguna semana ni mes', r.sinFecha],
    ['NO LLEGAN AL CUADRO — pendientes fechados antes del mes en curso', r.invisiblesAlCuadro],
    ['VENCIDOS y todavía pendientes', r.vencidos],
    ['COBRADOS con fecha de cobro FUTURA — percibido imposible', r.cobradosAFuturo],
  ]
  for (const [titulo, lista] of bloques) {
    console.log(`\n   ${titulo}: ${lista.length} por ${ars(lista.reduce((s, c) => s + c.monto, 0))}`)
    for (const c of lista.slice(0, 15)) {
      console.log(`      fila ${String(c.fila).padStart(3)}  ${ars(c.monto).padStart(16)}  ${iso(c.fecha)}  ${c.cliente.slice(0, 34)} · ${c.estado}`)
    }
    if (lista.length > 15) console.log(`      … y ${lista.length - 15} más`)
  }
  const dups = gruposIndistinguibles(cobros.map((c) => ({ ...c, fechaCobro: iso(c.fechaCobro) })))
  console.log(`\n   INDISTINGUIBLES por la clave canónica del repo: ${dups.length} grupos, ${ars(dups.reduce((s, g) => s + g.enJuego, 0))} en juego`)
  for (const g of dups) console.log(`      filas ${g.filas.join(', ')}  ${ars(g.monto)}  ${g.cliente} · ${g.fechaCobro}`)

  const a = auditarCadena(cfs, 'CASH FLOW SEMANAL')
  const b = auditarCadena(cfm, 'CASH FLOW MENSUAL')
  cruzarCuadros(cfs, cfm)
  cruzarCobranzas(cobros, cfm, hoy)

  const roto = !a.cierra || !b.cierra || r.sinFecha.length || r.invisiblesAlCuadro.length || r.cobradosAFuturo.length
  console.log(roto ? '\n⚠ hay huecos declarados arriba' : '\n✓ sin huecos')
  if (roto) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
