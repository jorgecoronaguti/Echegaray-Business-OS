#!/usr/bin/env node
// QUÉ USA EL OS, DÓNDE CORRE Y CUÁNTO CUESTA. Sale de las trazas, no de una declaración.
//
// Es la respuesta ejecutable a «¿qué modelos usa Echegaray y qué reemplazaron?». Todo lo que
// muestra viene de `orq.ml_traza` y `orq.chat_cost`: si una capacidad no aparece acá, no la está
// llamando nadie — y una capacidad que nadie llama no está en producción, por más archivo que haya.
//
//   node orquestador/scripts/ml-tablero.mjs [--dias 30]

import { query } from '../lib/db.mjs'
import { inventario } from '../lib/ml/registro.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const DIAS = arg('--dias', 30)

async function main() {
  console.log(`═══ LA CAPA ML DEL OS · últimos ${DIAS} días ═══\n`)

  // ── DÓNDE SE RESOLVIÓ CADA COSA ──
  const t = await query(`
    select metodo, coalesce(modelo, '—') modelo, count(*)::int n,
           round(avg(ms))::int ms_prom,
           round(percentile_cont(0.95) within group (order by ms))::int ms_p95,
           count(*) filter (where not ok)::int errores,
           count(*) filter (where hubo_fallback)::int fallbacks,
           coalesce(sum(costo_usd), 0)::float8 usd
      from orq.ml_traza where ts > now() - ($1 || ' days')::interval
     group by 1,2 order by 3 desc`, [String(DIAS)])

  const total = t.rows.reduce((s, r) => s + r.n, 0)
  const pc = (n) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—')
  console.log(`OPERACIONES ML  ${total}`)
  console.log('  método         modelo                                    n     %     ms   p95  err  fb')
  console.log('  ' + '─'.repeat(88))
  for (const r of t.rows) {
    console.log(`  ${r.metodo.padEnd(14)} ${String(r.modelo).slice(0, 40).padEnd(41)} ${String(r.n).padStart(5)} ${pc(r.n).padStart(6)} ${String(r.ms_prom).padStart(5)} ${String(r.ms_p95).padStart(5)} ${String(r.errores).padStart(4)} ${String(r.fallbacks).padStart(3)}`)
  }

  // ── EL REPARTO QUE IMPORTA: reglas contra modelo contra nube contra Claude ──
  const clase = { regla: 0, local: 0, nube: 0 }
  for (const r of t.rows) {
    if (r.metodo === 'regla' || r.metodo === 'sql') clase.regla += r.n
    else if (r.metodo === 'hf-remoto') clase.nube += r.n
    else if (r.metodo !== 'sin-resolver') clase.local += r.n
  }
  // `usd_estimado` es un BOOLEANO —«este costo es una estimación, no lo devolvió el proveedor»—,
  // no un importe alternativo. Meterlo en un COALESCE con `usd` no da un número peor: da un error
  // de tipos. Se suma `usd` y se dice aparte cuántos venían estimados, que es lo que el flag dice.
  const c = await query(`
    select count(*)::int n, sum(tokens_in)::bigint tin, sum(usd)::float8 usd,
           count(*) filter (where usd_estimado)::int estimados
      from orq.chat_cost where ts > now() - ($1 || ' days')::interval`, [String(DIAS)])
  const claude = c.rows[0]

  console.log(`\nREPARTO`)
  console.log(`  reglas / SQL          ${String(clase.regla).padStart(6)}   ${pc(clase.regla).padStart(7)}   costo 0`)
  console.log(`  modelo LOCAL          ${String(clase.local).padStart(6)}   ${pc(clase.local).padStart(7)}   costo 0 · la VM`)
  console.log(`  Hugging Face NUBE     ${String(clase.nube).padStart(6)}   ${pc(clase.nube).padStart(7)}   ${(t.rows.reduce((s, r) => s + (r.metodo === 'hf-remoto' ? r.usd : 0), 0)).toFixed(4)} USD`)
  console.log(`  CLAUDE                ${String(claude.n).padStart(6)}             ${Number(claude.tin ?? 0).toLocaleString('es-AR')} tokens · ${Number(claude.usd ?? 0).toFixed(2)} USD${claude.estimados ? ` (${claude.estimados} estimados)` : ''}`)

  // ── QUIÉN LLAMA A LA CAPA ──
  const m = await query(`
    select coalesce(modulo, '(sin rótulo)') modulo, count(*)::int n, round(avg(ms))::int ms
      from orq.ml_traza where ts > now() - ($1 || ' days')::interval
     group by 1 order by 2 desc limit 10`, [String(DIAS)])
  console.log('\nCONSUMIDORES REALES')
  for (const r of m.rows) console.log(`  ${r.modulo.padEnd(30)} ${String(r.n).padStart(6)} operaciones · ${r.ms} ms prom`)

  // ── LO DECLARADO CONTRA LO USADO ──
  // Un modelo en «producción» que no aparece en las trazas no está en producción: está escrito.
  const usados = new Set(t.rows.map((r) => r.modelo))
  // CLAUDE NO DEJA TRAZA EN `ml_traza`: la deja en `orq.chat_cost`, que es su propia contabilidad y
  // existe desde antes que esta capa. Buscarlo en la tabla equivocada lo marcaba como «declarado en
  // producción y SIN trazas» — una alarma falsa sobre lo único que sí corre todos los días.
  const claudeVivo = Number(claude.n) > 0
  console.log('\nREGISTRO CONTRA REALIDAD')
  for (const x of inventario()) {
    const enUso = x.proveedor === 'anthropic' || String(x.modelo).startsWith('lib/ia')
      ? claudeVivo
      : [...usados].some((u) => u && x.modelo && String(u).includes(String(x.modelo).split('/').pop()))
    const marca = x.estado === 'produccion' ? (enUso ? '✔' : '✖') : ' '
    console.log(`  ${marca} ${String(x.capacidad).padEnd(18)} ${String(x.modelo).slice(0, 42).padEnd(43)} ${x.estado}${x.estado === 'produccion' && !enUso ? '  ← declarado en producción y SIN trazas' : ''}`)
  }

  // ── QUÉ SE INTENTÓ MANDAR AFUERA Y NO SALIÓ ──
  const b = await query(`
    select count(*)::int n from orq.ml_traza
     where ts > now() - ($1 || ' days')::interval and metodo = 'sin-resolver' and proveedor is not null`, [String(DIAS)])
  if (b.rows[0].n) console.log(`\nPRIVACIDAD  ${b.rows[0].n} operación(es) bloqueadas por política antes de salir de la VM`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
