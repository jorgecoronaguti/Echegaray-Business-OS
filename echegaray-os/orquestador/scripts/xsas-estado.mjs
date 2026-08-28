#!/usr/bin/env node
// EL ESTADO DE UN PROYECTO XSAS: qué formato llegó hasta dónde, y cuánto se puede apoyar en el precio.
//
// Son las dos preguntas que un total no contesta y que hasta ahora se contestaban con adjetivos:
// «soportamos DWG» y «la cotización está bien». Acá salen los dos cuadros con números por archivo y
// por regla, sobre una corrida real.
//
//   node orquestador/scripts/xsas-estado.mjs quattropani
//   node orquestador/scripts/xsas-estado.mjs quattropani --sin-modelo   # 0 API: sólo caché y CAD
//
// `--sin-modelo` no cambia el cuadro de formatos salvo en lo que dependa de una mirada nueva, y esa
// dependencia se ve: el bloque de degradación dice qué no se pudo leer y por qué.

import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { correr } from '../lib/plano/pipeline.mjs'
import { cuadroDeFormatos, ETAPAS } from '../lib/ingesta/capacidades.mjs'
import { agruparPartidas, armar } from '../lib/plano/cotizacion-v0.mjs'
import { certeza } from '../lib/plano/certeza.mjs'

const config = loadConfig()
const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
if (!termino) {
  console.error('uso: xsas-estado.mjs <termino> [--sin-modelo] [--sin-regiones] [--detalle]')
  process.exit(1)
}
const google = makeGoogleClient({ config })
const r = await correr({
  query, google, termino,
  porRegiones: !args.includes('--sin-regiones'),
  permitirModelo: !args.includes('--sin-modelo'),
})

const cuadro = cuadroDeFormatos(r)
const pad = (s, n) => String(s).padEnd(n)
const marca = (b) => (b ? ' ✔ ' : ' — ')

console.log(`\n═══ ${termino.toUpperCase()} · ESTADO DE INGESTA Y DE CERTEZA ═══\n`)
console.log('── EL ESTADO DE CADA FORMATO, POR SEPARADO ──')
console.log(`  ${cuadro.resumen}\n`)
console.log(`  ${pad('formato', 26)}${pad('eje', 12)}${pad('arch', 6)}${ETAPAS.map((e) => pad(e.slice(0, 11), 13)).join('')}`)
for (const f of cuadro.filas) {
  const cel = ETAPAS.map((e) => pad(f.archivos ? `${marca(f[e] === f.archivos)}${f[e]}/${f.archivos}` : '   —', 13)).join('')
  console.log(`  ${pad(f.formato, 26)}${pad(f.eje, 12)}${pad(f.archivos, 6)}${cel}`)
  console.log(`      ${f.porQue}`)
}
if (cuadro.sinFila.length) console.log(`\n  ${cuadro.sinFila.length} archivo(s) sin fila en el cuadro: ${cuadro.sinFila.slice(0, 6).join(' | ')}`)

if (args.includes('--detalle')) {
  console.log('\n  ARCHIVO POR ARCHIVO:')
  for (const a of cuadro.archivos) {
    console.log(`   ${pad(a.archivo.slice(0, 52), 54)}${ETAPAS.map((e) => marca(a.etapas[e].ok)).join('')}  ${a.contenedor ?? '?'}${a.rol ? ` + ${a.rol}` : ''}`)
    for (const e of ETAPAS) if (!a.etapas[e].ok) { console.log(`       ${e}: ${a.etapas[e].porQue}`); break }
  }
}

// ═══ LA CERTEZA ═══
// La cotización se ARMA acá y no en el pipeline: el pipeline devuelve partidas y composiciones, y
// valorizarlas es una decisión de quien las consume. Sin este paso las cuatro métricas económicas
// salen en `null`, que es lo correcto — no en cero.
const { partidas, candidatas } = agruparPartidas(r.mapeo.mapeos)
const cotizacion = armar({ cliente: null, obraNombre: termino, partidas, composiciones: r.composiciones, candidatas })
const c = certeza({ control: r.control, items: r.computo.items, cotizacion, proyecto: r.proyecto })

console.log('\n── LA CERTEZA DE LA COTIZACIÓN ──')
console.log(`  ${c.resumen}`)
console.log(`  costo directo ${c.metricas.costoDirecto === null ? '— (ninguna partida cerró su costo)' : `$ ${c.metricas.costoDirecto.toLocaleString('es-AR')}`} · HH ${c.metricas.hh ?? '—'} · ${c.metricas.vigencia.porQue}`)
console.log('\n  LAS REGLAS:')
for (const g of c.reglas) console.log(`   ${marca(g.pasa)} ${pad(g.clave, 20)} ${pad(`techo si falla: ${g.tope}`, 40)} ${g.exige}`)
console.log(`\n  ESTADO: ${c.estado}${c.estado === c.porMedicion ? '' : ` (por medición: ${c.porMedicion})`}`)
console.log(`  PARA SUBIR A ${c.paraSubir.siguiente ?? '—'}: ${c.paraSubir.porQue}`)
for (const f of c.paraSubir.falta) console.log(`     · ${f}`)
if (c.queFalta.length > c.paraSubir.falta.length) {
  console.log('\n  Y LO QUE ADEMÁS HAY QUE ARREGLAR MÁS ARRIBA:')
  for (const f of c.queFalta) if (!c.paraSubir.falta.includes(f.falta)) console.log(`     [${f.tope}] ${f.falta}`)
}
if (c.metricas.supuestos.partidas?.length) {
  console.log('\n  LA PLATA QUE SE APOYA EN UN SUPUESTO OCULTO:')
  for (const p of c.metricas.supuestos.partidas) console.log(`     $ ${pad(p.monto.toLocaleString('es-AR'), 16)} ${p.codigo} ${p.descripcion} — ${p.elementos.join(', ')}`)
}

const deg = r.degradacion ?? {}
console.log(`\n── CÓMO SE OBTUVIERON ESTOS NÚMEROS ──`)
console.log(`  ${deg.hubo ? `⚠ corrida DEGRADADA: ${deg.fallos} pedido(s) al modelo no se resolvieron` : 'corrida sin degradación'} · ${r.ia.llamadas} llamada(s) al modelo · ${r.ia.deCache} lámina(s) de caché`)
process.exit(0)
