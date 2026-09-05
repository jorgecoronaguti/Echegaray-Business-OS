#!/usr/bin/env node
// EN QUÉ SE VA LA PLATA DE VISIÓN, POR SUBCAPACIDAD.
//
//   node orquestador/scripts/vision-descomposicion.mjs [--dias 30]
//
// Lee las lecturas YA PAGADAS (el caché de `interpretar-region`, en base y en disco) y el costo
// real de `orq.chat_cost`, y reparte uno sobre el otro. No estima nada que se pueda contar.

import fs from 'node:fs'
import path from 'node:path'
import { getPool } from '../lib/db.mjs'
import { DIR_CACHE } from '../lib/plano/cache-lecturas.mjs'
import { descomponer } from '../lib/ml/vision-subcapacidad.mjs'

const SQL_COSTO = `
  select count(*)::int n, coalesce(sum(usd),0)::float usd,
         coalesce(sum(tokens_in),0)::int t_in, coalesce(sum(tokens_out),0)::int t_out
  from orq.chat_cost
  where ts > now() - ($1 || ' days')::interval and funcion = 'interpretar-region'`

/** Todas las lecturas de región cacheadas, de las dos fuentes. La base manda; el disco completa. */
export async function lecturasDeRegion(query = null, dir = DIR_CACHE) {
  const vistas = new Map()
  if (query) {
    try {
      const r = await query(`select llave, valor from orq.plano_lectura_cache where llave like 'v3region:%'`)
      for (const f of r.rows ?? []) vistas.set(f.llave, f.valor)
    } catch { /* el disco alcanza */ }
  }
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('v3region')) continue
      const llave = f.replace(/\.json$/, '')
      if (vistas.has(llave)) continue
      try { vistas.set(llave, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) } catch { /* rota */ }
    }
  } catch { /* no hay disco */ }
  return [...vistas.values()]
}

async function main() {
  const dias = Number(process.argv[process.argv.indexOf('--dias') + 1]) || 30
  const pool = getPool()
  const q = (sql, args) => pool.query(sql, args)

  const costo = (await q(SQL_COSTO, [String(dias)])).rows[0]
  const lecturas = await lecturasDeRegion(q)
  const d = descomponer(lecturas, { usdTotal: Number(costo.usd), llamadasReales: costo.n })

  console.log(`\n═══ interpretar-region · últimos ${dias} días ═══\n`)
  console.log(`  ${costo.n} llamadas · $${Number(costo.usd).toFixed(2)} · ${costo.t_in} tokens in · ${costo.t_out} tokens out`)
  console.log(`  muestra con contenido guardado: ${d.muestra} lecturas (${d.cobertura}% de las llamadas)\n`)

  console.table(d.porTipo.map((t) => ({
    subcapacidad: t.tipo, llamadas: t.n, 'usd (repartido)': t.usd,
    'elementos': t.elementos, 'con dato útil': t.elementosUtiles,
    '% salida que es TEXTO': t.fraccionTexto,
  })))

  console.log('\n═══ EN QUÉ CAMPO DE LA RESPUESTA SE VA LA SALIDA ═══\n')
  console.table(d.porCampo.map((c) => ({ campo: c.campo, origen: c.origen, '% de la salida': c.pct })))

  const texto = d.porCampo.filter((c) => c.origen === 'TEXTO').reduce((a, c) => a + c.pct, 0)
  console.log(`\n  ${Math.round(texto * 10) / 10}% de la salida sale de campos que YA ESTÁN ESCRITOS en el plano.`)
  console.log('  Eso no prueba que se puedan leer sin modelo — prueba dónde hay que ir a probarlo.\n')

  await pool.end()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
