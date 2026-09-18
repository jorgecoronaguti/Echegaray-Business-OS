#!/usr/bin/env node
// EL ADELANTO DE LAS QUINCENAS SIN COLUMNA BANCO — ensayo en seco, evidencia bancaria, corrección y reversa.
//
// La regla entera está en la cabecera de `orquestador/lib/jornales-banco-adelanto.mjs`. En una frase: en los
// bloques de JORNALES donde NADIE anotó la columna BANCO, el ADELANTO podría haber salido por transferencia
// (escenario A); eso se afirma sólo con evidencia del extracto, quincena por quincena, y se corrige por override
// en `liquidacion_linea` (nunca en el Sheet), guardando antes una reversa.
//
// USO:
//   node orquestador/scripts/jornales-banco-adelanto-corregir.mjs                          ← ENSAYO EN SECO + evidencia
//   node orquestador/scripts/jornales-banco-adelanto-corregir.mjs --json                   ← lo mismo, JSON
//   node orquestador/scripts/jornales-banco-adelanto-corregir.mjs --aplicar --quincena 2026-05-16
//       ← escribe SÓLO esa quincena, y SÓLO si su evidencia bancaria es «sí». Sin evidencia, se frena.
//   node orquestador/scripts/jornales-banco-adelanto-corregir.mjs --aplicar --quincena 2026-05-16 --confirmo-escenario-A
//       ← la palabra del dueño reemplaza a la evidencia. NO USAR sin ella.
//   node orquestador/scripts/jornales-banco-adelanto-corregir.mjs --revertir orquestador/datos/respaldos/<archivo>.json
//
// La reversa se guarda en `orquestador/datos/respaldos/jornales-banco-adelanto-<quincena>-<momento>.json` ANTES
// de escribir (los valores previos) y se completa después con lo escrito. Se prueba en
// `orquestador/lib/jornales-banco-adelanto.pg.test.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { closePool, query, withTx } from '../lib/db.mjs'
import {
  aplicarQuincena, evidenciaBancaria, leerLineas, lineaBloqueada, planDeCorreccion, revertirQuincena,
} from '../lib/jornales-banco-adelanto.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
const APLICAR = process.argv.includes('--aplicar')
const CONFIRMADO = process.argv.includes('--confirmo-escenario-A')
const JSON_OUT = process.argv.includes('--json')
const QUINCENA = arg('--quincena')
const REVERTIR = arg('--revertir')

const RAIZ = join(import.meta.dirname, '..', '..')
const RESPALDOS = join(RAIZ, 'orquestador', 'datos', 'respaldos')
const ars = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }))
const VEREDICTO = { si: 'SÍ (cuadra con los adelantos)', parcial: 'PARCIAL', no: 'NO', 'sin-extracto': 'SIN EXTRACTO' }

async function main() {
  if (REVERTIR) return revertir(REVERTIR)

  const { plan, sinQuincena } = await planDeCorreccion(query)
  for (const q of plan) q.evidencia = await evidenciaBancaria(query, q)

  if (JSON_OUT) {
    console.log(JSON.stringify({
      sinQuincena,
      quincenas: plan.map(({ lineas, bloqueadas, evidencia, ...r }) => ({
        ...r, bloqueadas: bloqueadas.length,
        evidencia: { veredicto: evidencia.veredicto, ventana: evidencia.ventana, apareadas: evidencia.apareadas, totalHaberes: evidencia.totalHaberes ?? null },
        lineas: lineas.map((l) => ({ persona: l.nombre_completo, adelanto: l.planilla_adelanto, bloqueada: lineaBloqueada(l) })),
      })),
    }, null, 2))
  } else {
    imprimirPlan(plan, sinQuincena)
  }

  if (!APLICAR) { console.log('\n(sin --aplicar: no escribí nada)'); return }
  if (!QUINCENA) { console.error('\n✖ --aplicar exige --quincena <desde>: se corrige UNA quincena por vez, con su evidencia.'); process.exitCode = 1; return }
  const q = plan.find((x) => x.desde === QUINCENA)
  if (!q) { console.error(`\n✖ no hay ninguna quincena sin BANCO que empiece el ${QUINCENA}.`); process.exitCode = 1; return }
  if (q.evidencia.veredicto !== 'si' && !CONFIRMADO) {
    console.error(`\n✖ BLOQUEADO: la evidencia bancaria de ${q.desde}..${q.hasta} es «${VEREDICTO[q.evidencia.veredicto]}», no «sí».`)
    console.error('  El extracto no muestra transferencias que cuadren con los adelantos. Sin eso, y sin la palabra del dueño')
    console.error('  (--confirmo-escenario-A), este script no escribe. Nunca inferir sin evidencia.')
    process.exitCode = 1
    return
  }
  const libres = q.lineas.filter((l) => !lineaBloqueada(l))
  if (!libres.length) { console.log('\nNada que escribir: todas las líneas están pagadas o escritas a mano.'); return }
  const motivo = q.evidencia.veredicto === 'si'
    ? `evidencia bancaria: ${q.evidencia.apareadas}/${q.lineas.length} adelantos apareados con salidas del extracto en ${q.evidencia.ventana.desde}..${q.evidencia.ventana.hasta}`
    : 'confirmación explícita del dueño (--confirmo-escenario-A): el ADELANTO sale por transferencia'

  // LA REVERSA SE GUARDA ANTES DE ESCRIBIR: los valores previos, leídos de la base.
  const previas = await leerLineas(query, libres.map((l) => l.linea_id))
  const momento = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
  const archivo = join(RESPALDOS, `jornales-banco-adelanto-${q.desde}-${momento}.json`)
  mkdirSync(dirname(archivo), { recursive: true })
  writeFileSync(archivo, JSON.stringify({
    estado: 'previo-a-escribir', cuando: new Date().toISOString(), motivo, liquidacionId: q.liquidacionId,
    desde: q.desde, hasta: q.hasta, grupo: q.grupo,
    lineas: previas.map((p) => ({ lineaId: p.linea_id, nombre: p.nombre_completo, previo: { ya_transferido_manual: p.ya_transferido_manual, adelanto_manual: p.adelanto_manual } })),
  }, null, 1))
  console.log(`\n  reversa (valores previos): ${archivo}`)

  const { reversa, noEscritas } = await withTx((tx) => aplicarQuincena(tx, { ...q, lineas: libres }, { motivo }))
  writeFileSync(archivo, JSON.stringify({ estado: 'escrita', ...reversa }, null, 1))
  for (const n of noEscritas) console.log(`   ⚠ ${n.linea.nombre_completo}: no se escribió (${n.motivo})`)

  // LA EVIDENCIA ES LO LEÍDO EN LA BASE después de escribir, no el rowCount.
  const leidas = await leerLineas(query, reversa.lineas.map((l) => l.lineaId))
  console.log(`\n✔ escritas ${reversa.lineas.length} línea(s) de ${q.desde}..${q.hasta}. Leído de vuelta:`)
  for (const l of leidas) console.log(`   ${l.nombre_completo.padEnd(36)} ya_transferido_manual=${ars(l.ya_transferido_manual)}  adelanto_manual=${ars(l.adelanto_manual)}`)
  console.log(`\n  para deshacer: node orquestador/scripts/jornales-banco-adelanto-corregir.mjs --revertir ${archivo}`)
  console.log('  FALTA EL CIERRE: esto lo tiene que mirar en app.ecsas.com.ar alguien que no lo escribió.')
}

async function revertir(ruta) {
  const reversa = JSON.parse(readFileSync(ruta, 'utf8'))
  if (reversa.estado !== 'escrita') { console.error(`✖ ${ruta}: estado «${reversa.estado}», no hay escritura que deshacer.`); process.exitCode = 1; return }
  const { restauradas, noRestauradas } = await withTx((tx) => revertirQuincena(tx, reversa))
  for (const n of noRestauradas) console.log(`   ⚠ ${n.nombre}: no se restauró (${n.motivo})`)
  const leidas = await leerLineas(query, restauradas.map((r) => r.lineaId))
  console.log(`✔ restauradas ${restauradas.length} de ${reversa.lineas.length} línea(s) de ${reversa.desde}..${reversa.hasta}. Leído de vuelta:`)
  for (const l of leidas) console.log(`   ${l.nombre_completo.padEnd(36)} ya_transferido_manual=${ars(l.ya_transferido_manual)}  adelanto_manual=${ars(l.adelanto_manual)}`)
  writeFileSync(ruta, JSON.stringify({ ...reversa, estado: 'revertida', revertidaEn: new Date().toISOString(), noRestauradas }, null, 1))
}

function imprimirPlan(plan, sinQuincena) {
  console.log('\n╔══ ESCENARIO A — «el ADELANTO se paga por transferencia» ══╗')
  console.log('   ENSAYO EN SECO. Lo que cambiaría en el legajo, y qué dice el extracto del Santander de cada quincena.\n')
  console.log('quincena            bloque JORNALES   grupo    empl.   pesos EFECTIVO→BANCO   bloq.  evidencia bancaria (ventana)')
  console.log('─'.repeat(120))
  let tp = 0; let te = 0; let tb = 0
  for (const r of plan) {
    const e = r.evidencia
    const ventana = e.veredicto === 'sin-extracto' ? `extracto desde ${e.extractoDesde ?? '?'}` : `${e.ventana.desde}..${e.ventana.hasta}`
    console.log(`${r.desde}..${r.hasta.slice(5)}  ${r.bloque.desde.slice(5)}..${r.bloque.hasta.slice(5)}      ${r.grupo.padEnd(8)} ${String(r.empleados).padStart(4)}   ${ars(r.pesos).padStart(20)}   ${String(r.bloqueadas.length).padStart(4)}   ${VEREDICTO[e.veredicto]} (${ventana})`)
    if (e.veredicto !== 'sin-extracto') {
      const detalle = e.apareos.filter((a) => a.tipo !== 'ninguno').map((a) => `${a.linea.nombre_completo}: ${a.tipo}${a.movimiento ? ` ${a.movimiento.fecha} ${ars(-a.movimiento.importe)}` : ''}`)
      if (detalle.length) console.log(`      apareos: ${detalle.join(' · ')}`)
      if (e.lotesHaberes.length) console.log(`      lotes de haberes en la ventana: ${e.lotesHaberes.length} movimiento(s) por ${ars(e.totalHaberes)} — plata que salió por banco y la planilla no anotó como BANCO`)
    }
    if (r.sinPersona.length) console.log(`      sin persona en la app (no se corrige): ${r.sinPersona.map((s) => `${s.nombre} ${ars(s.adelanto)}`).join(' · ')}`)
    tp += r.pesos; te += r.empleados; tb += r.bloqueadas.length
  }
  console.log('─'.repeat(120))
  console.log(`${'TOTAL'.padEnd(43)} ${String(te).padStart(4)}   ${ars(tp).padStart(20)}   ${String(tb).padStart(4)}`)
  console.log(`\n   Legajos distintos afectados: ${new Set(plan.flatMap((r) => r.lineas.map((l) => l.persona_id))).size}`)
  if (sinQuincena.length) console.log(`   Bloques con adelanto sin quincena que los contenga: ${sinQuincena.map((s) => `${s.pestana} ${s.bloque}`).join(' · ')}`)
  console.log('\n   QUÉ PASA EN CADA LÍNEA: ya_transferido_manual = adelanto de la planilla; adelanto_manual = 0.')
  console.log('   EFECTO EN EL LEGAJO: «Pagado · banco» sube ese importe y «Pagado · efectivo» baja el mismo importe;')
  console.log('   el total pagado NO cambia. La columna «Banco» sigue sin cifra: el adelanto no es el neto del recibo.')
  console.log('   SÓLO SE APLICA una quincena cuya evidencia bancaria sea «sí», o con la palabra del dueño (--confirmo-escenario-A).')
}

try {
  await main()
} finally {
  await closePool()
}
