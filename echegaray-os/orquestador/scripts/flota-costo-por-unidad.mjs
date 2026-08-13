#!/usr/bin/env node
// EL COSTO DE LA FLOTA POR UNIDAD — lee costos_obra y muestra el cuadro. NO ESCRIBE NADA.
//
// Es sólo la cara: toda la regla vive en lib/flota-unidades.mjs y lib/flota-costos.mjs, que son
// puras y están testeadas sin base. Este archivo lee, ordena y formatea — si mañana el cuadro tiene
// que salir en una pestaña o en la web, se cambia la cara y el número sigue siendo el mismo.
//
//   node orquestador/scripts/flota-costo-por-unidad.mjs [--corte 2026-08-13] [--sin-unidad]
//
// --sin-unidad lista las filas que no se pudieron atribuir, con su causa. Esa lista es la tarea
// concreta que queda pendiente, no un anexo.
import { query } from '../lib/db.mjs'
import { cuadroFlota, clasificarFila, COMPONENTES } from '../lib/flota-costos.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(n)
const $ = (n) => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const NOMBRE_COMPONENTE = Object.fromEntries(COMPONENTES.map((c) => [c.clave, c.nombre]))
const CAUSAS = {
  compartido: 'la fila nombra 2+ unidades (repartir requiere litros por unidad)',
  ambiguo: 'nombra una familia con varias unidades ("Ford", "Toyota")',
  apodo_sin_mapear: 'apodo del dueño sin unidad declarada',
  no_nombrada: 'el texto no dice qué unidad',
}

async function traerFilas() {
  const { rows } = await query(
    `select proveedor, concepto, obra_texto, fecha, total
       from public.costos_obra
      where fecha is not null
      order by fecha`,
  )
  return rows
}

function imprimirUnidades(c) {
  console.log('\n═══ COSTO POR UNIDAD ═══  (corte ' + c.corte.toISOString().slice(0, 10) + ')\n')
  for (const u of c.unidades) {
    if (u.real === 0 && u.comprometido === 0) continue
    const id = u.patente ?? u.serie ?? 's/identificar'
    console.log(`${u.nombre}  [${id}]  ${u.tipo}`)
    console.log(`   REAL $${$(u.real)}` + (u.comprometido ? `   ·   COMPROMETIDO $${$(u.comprometido)}` : '') + `   (${u.filas} comprobantes)`)
    for (const [k, v] of Object.entries(u.porComponente).sort((a, b) => b[1].real - a[1].real)) {
      console.log(`      ${(NOMBRE_COMPONENTE[k] ?? k).padEnd(28)} $${$(v.real)}` + (v.comprometido ? `  (+$${$(v.comprometido)} por vencer)` : ''))
    }
    const obras = Object.entries(u.obras).sort((a, b) => b[1] - a[1])
    if (obras.length) console.log('      dónde se usó: ' + obras.map(([o, m]) => `${o} $${$(m)}`).join(' · '))
    console.log('')
  }
  const cero = c.unidades.filter((u) => u.real === 0 && u.comprometido === 0)
  if (cero.length) console.log('EN CERO (ningún comprobante atribuido): ' + cero.map((u) => u.nombre).join(' · ') + '\n')
}

function imprimirSinUnidad(c) {
  const s = c.sinUnidad
  console.log('═══ SIN UNIDAD ═══')
  console.log(`   $${$(s.real)} reales en ${s.filas} comprobantes = ${(c.pctSinUnidad * 100).toFixed(1)}% del costo real de flota`)
  for (const [k, v] of Object.entries(s.porCausa).sort((a, b) => b[1].real - a[1].real)) {
    console.log(`      ${k.padEnd(18)} $${$(v.real)}  (${v.filas})  ← ${CAUSAS[k] ?? ''}`)
  }
  console.log(`\n   TOTAL FLOTA REAL $${$(c.totalReal)}   ·   COMPROMETIDO (futuro) $${$(c.totalComprometido)}`)
}

async function main() {
  const corte = new Date(arg('--corte', new Date().toISOString().slice(0, 10)))
  const filas = await traerFilas()
  const c = cuadroFlota(filas, { corte })
  imprimirUnidades(c)
  imprimirSinUnidad(c)

  if (flag('--sin-unidad')) {
    console.log('\n═══ LAS FILAS QUE FALTA ATRIBUIR ═══')
    for (const f of filas) {
      const k = clasificarFila(f)
      if (!k || k.unidad) continue
      const d = f.fecha?.toISOString?.().slice(0, 10) ?? ''
      console.log(`${d} | ${k.causa.padEnd(17)} | $${$(k.total).padStart(11)} | ${f.proveedor} | ${String(f.concepto).slice(0, 80)}`)
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
