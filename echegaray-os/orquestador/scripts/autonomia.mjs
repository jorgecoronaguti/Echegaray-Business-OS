#!/usr/bin/env node
// EL TABLERO DE AUTONOMÍA — para dirección técnica, no para la app.
//
//   node orquestador/scripts/autonomia.mjs [--dias 30]
//
// ═══ POR QUÉ ES UN COMANDO Y NO UNA PANTALLA ═══
//
// El `CLAUDE.md` de la raíz es explícito: no se crea un dashboard sin decisiones asociadas. Este
// número no lo mira nadie de la empresa para decidir nada — lo miro yo para saber dónde poner el
// trabajo siguiente. Una pantalla en `app.ecsas.com.ar` mostrando «Autonomy Rate» sería exactamente
// el tablero decorativo que el OS tiene prohibido.
//
// ═══ LAS TRES CIFRAS Y CÓMO SE LEEN ═══
//
//   AUTONOMÍA    de lo que el OS contestó, cuánto contestó sin Claude
//   ABSTENCIÓN   cuánto intentó y NO contestó por no superar su piso  (no es un fracaso)
//   ESCALADO     cuánto contestó Claude, y por qué
//
// Un módulo con autonomía 100% y 700 abstenciones NO es un módulo autónomo: es un módulo que casi
// nunca contesta. Por eso las tres van juntas y ninguna se muestra sola.

import { getPool } from '../lib/db.mjs'
import { autonomyRate, pct } from '../lib/ml/autonomia.mjs'

const SQL_ESCALADAS = `
  select coalesce(agente,'sin-agente') modulo, coalesce(funcion,'sin-funcion') funcion,
         model, count(*)::int n, round(sum(coalesce(usd,0))::numeric,2) usd
  from orq.chat_cost
  where ts > now() - ($1 || ' days')::interval and ok and proveedor = 'anthropic'
  group by 1,2,3 order by n desc limit 12`

async function main() {
  const dias = Number(process.argv[process.argv.indexOf('--dias') + 1]) || 30
  const pool = getPool()
  const q = (sql, args) => pool.query(sql, args)

  const r = await autonomyRate(q, { dias })
  const g = r.global

  console.log(`\n═══ AUTONOMY RATE · últimos ${dias} días ═══\n`)
  console.log(`  AUTONOMÍA   ${pct(g.autonomia).padStart(6)}   ${g.resuelto} de ${g.contestadas} operaciones contestadas se resolvieron sin Claude`)
  console.log(`  ESCALADO    ${pct(g.contestadas ? g.escalado / g.contestadas : null).padStart(6)}   ${g.escalado} llegaron a Claude`)
  console.log(`  ABSTENCIÓN  ${pct(g.abstencion).padStart(6)}   ${g.abstuvo} el OS las intentó y NO alcanzó su piso de confianza`)
  console.log('')

  // ═══ EL COSTO, ATADO A LA AUTONOMÍA Y NO SUELTO ═══
  // «$42 por mes» no dice nada solo. «$0,18 por cada operación que el OS resolvió sin Claude» sí:
  // es el número que baja cuando la autonomía sube, y el único que junta las dos cosas.
  const c = r.costo
  const usd = (n) => (n == null ? '—' : `$${n.toFixed(n < 1 ? 4 : 2)}`)
  console.log(`  COSTO       ${usd(c.usdTotal).padStart(8)}   en la ventana · Claude ${usd(c.usdClaude)} · HF ${usd(c.usdHf)} · local $0 en caja`)
  console.log(`  POR AUTÓNOMA${usd(c.porAutonoma).padStart(8)}   lo que cuesta cada operación que el OS resolvió solo`)
  console.log(`              ${pct(c.fraccionClaude).padStart(8)}   de cada peso gastado se fue en escalar a Claude`)
  console.log('')

  console.table(r.porModulo.map((m) => ({
    modulo: m.modulo,
    resuelto: m.resuelto,
    escalado: m.escalado,
    abstuvo: m.abstuvo,
    autonomia: pct(m.autonomia),
    usd: m.usd,
  })))

  // DÓNDE ESTÁ CLAUDE, Y POR CUÁNTO. Sin esto la tasa dice que hay que trabajar, pero no dónde.
  const esc = await q(SQL_ESCALADAS, [String(dias)])
  if (esc.rows.length) {
    console.log('\n═══ QUÉ LLEGA A CLAUDE, Y CUÁNTO CUESTA ═══\n')
    console.table(esc.rows.map((f) => ({
      modulo: f.modulo, funcion: f.funcion, modelo: String(f.model).slice(0, 26), n: f.n, usd: f.usd,
    })))
  }

  // LA LECTURA, ESCRITA. Un número sin su lectura se malinterpreta solo.
  const cero = r.porModulo.filter((m) => m.escalado > 0 && m.resuelto === 0)
  if (cero.length) {
    console.log(`\n${cero.length} módulo(s) con autonomía 0% —todo lo que contestan lo contesta Claude—:`)
    console.log(`   ${cero.map((m) => `${m.modulo} (${m.escalado})`).join(' · ')}`)
    console.log('   Ahí es donde subir la autonomía cambia algo. Los módulos al 100% son lotes: nadie les pregunta nada.')
  }

  await pool.end()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
