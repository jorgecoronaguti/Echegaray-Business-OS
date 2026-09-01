#!/usr/bin/env node
// ¿CUÁNTO DEL USO COTIDIANO DE XSAS ES GRATIS EN TÉRMINOS DE CLAUDE? — sin gastar un token.
//
//   node orquestador/scripts/xsas-claude-zero.mjs            el cuadro
//   node orquestador/scripts/xsas-claude-zero.mjs --dias 7   otra ventana
//   node orquestador/scripts/xsas-claude-zero.mjs --json     para otro programa
//
// LA MÉTRICA. `FREQUENT_SKILL_CLAUDE_ZERO_RATE` = pedidos exitosos de las capacidades MÁS USADAS
// resueltos con cero llamadas a un modelo, sobre el total de pedidos exitosos de esas capacidades.
// «Frecuentes» no se elige a dedo: son las N intenciones con más ejecuciones REALES en la ventana.
//
// UNA OPERACIÓN ES CLAUDE-ZERO SÓLO SI `llm = false`. La traza pone `llm = true` en cuanto hubo un
// `modelo` que respondió —directo, de fallback, clasificador o extractor da igual—, así que acá no
// hay forma de declarar cero escondiendo una llamada: el cero sale de la misma fila que la pagaría.
//
// SIN DATOS DICE NO_MEDIDO. Cero pedidos en la ventana es un hecho («las caras no entraron por la
// puerta»), no un 100% de Claude-zero: un cociente sobre cero no es una medición.
import { query } from '../lib/db.mjs'

const arg = (n, d) => {
  const i = process.argv.indexOf(n)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d
}
const dias = Number(arg('--dias', '30'))
const cuantas = Number(arg('--top', '10'))
const json = process.argv.includes('--json')

const VENTANA = `creado_en > now() - ($1 || ' days')::interval`

const { rows: porIntencion } = await query(`
  select coalesce(intencion, '(sin intención)') intencion,
         count(*)::int                                  pedidos,
         count(*) filter (where estado <> 'error')::int  exitosos,
         count(*) filter (where estado <> 'error' and not llm)::int sin_llm,
         coalesce(sum(coalesce(tokens_in,0) + coalesce(tokens_out,0)), 0)::int tokens,
         coalesce(sum(usd), 0)                          usd
    from orq.xsas_requests
   where ${VENTANA}
   group by 1
   order by pedidos desc`, [String(dias)])

const { rows: razones } = await query(`
  select coalesce(reasoner_required_reason, '(sin razón registrada)') razon,
         count(*)::int n, coalesce(sum(usd), 0) usd
    from orq.xsas_requests
   where ${VENTANA} and (llm or reasoner_required_reason is not null)
   group by 1 order by n desc`, [String(dias)])

const frecuentes = porIntencion.slice(0, cuantas)
const suma = (rs, c) => rs.reduce((a, r) => a + Number(r[c] ?? 0), 0)

const exitosos = suma(frecuentes, 'exitosos')
const sinLlm = suma(frecuentes, 'sin_llm')
const totExitosos = suma(porIntencion, 'exitosos')
const totSinLlm = suma(porIntencion, 'sin_llm')

const tasa = (n, d) => (d > 0 ? n / d : null)
const pct = (v) => (v == null ? 'NO_MEDIDO' : `${(v * 100).toFixed(1)}%`)

const m = {
  ventana_dias: dias,
  pedidos: suma(porIntencion, 'pedidos'),
  FREQUENT_SKILL_CLAUDE_ZERO_RATE: tasa(sinLlm, exitosos),
  CLAUDE_ZERO_RATE_TOTAL: tasa(totSinLlm, totExitosos),
  REASONER_ESCALATION_RATE: tasa(exitosos - sinLlm, exitosos),
  TOKENS_PER_FREQUENT_OPERATION: exitosos > 0 ? suma(frecuentes, 'tokens') / exitosos : null,
  USD_PER_FREQUENT_OPERATION: exitosos > 0 ? suma(frecuentes, 'usd') / exitosos : null,
  frecuentes: frecuentes.map((r) => ({
    intencion: r.intencion,
    usos: r.pedidos,
    claude_zero: tasa(r.sin_llm, r.exitosos),
    usd: Number(r.usd),
  })),
  razones: razones.map((r) => ({ razon: r.razon, n: r.n, usd: Number(r.usd) })),
}

if (json) {
  console.log(JSON.stringify(m, null, 2))
} else if (m.pedidos === 0) {
  console.log(`\nNO_MEDIDO — cero pedidos por la puerta de XSAS en los últimos ${dias} días.`)
  console.log('No es 100% Claude-zero: es que no hay nada que medir.\n')
} else {
  console.log(`\nXSAS · últimos ${dias} días · ${m.pedidos} pedidos por la puerta\n`)
  console.log(`  FREQUENT_SKILL_CLAUDE_ZERO_RATE  ${pct(m.FREQUENT_SKILL_CLAUDE_ZERO_RATE)}   (top ${frecuentes.length} intenciones)`)
  console.log(`  CLAUDE_ZERO_RATE_TOTAL           ${pct(m.CLAUDE_ZERO_RATE_TOTAL)}`)
  console.log(`  REASONER_ESCALATION_RATE         ${pct(m.REASONER_ESCALATION_RATE)}`)
  console.log(`  TOKENS_PER_FREQUENT_OPERATION    ${m.TOKENS_PER_FREQUENT_OPERATION == null ? 'NO_MEDIDO' : m.TOKENS_PER_FREQUENT_OPERATION.toFixed(1)}`)
  console.log(`  USD_PER_FREQUENT_OPERATION       ${m.USD_PER_FREQUENT_OPERATION == null ? 'NO_MEDIDO' : `US$ ${m.USD_PER_FREQUENT_OPERATION.toFixed(5)}`}\n`)
  console.table(m.frecuentes.map((r) => ({ intención: r.intencion, usos: r.usos, 'claude-zero': pct(r.claude_zero), USD: r.usd.toFixed(4) })))
  console.log('\nPor qué hizo falta el razonador (MISSING_RULE y SIN_JUSTIFICAR = candidatos a código):')
  console.table(m.razones)
}
process.exit(0)
