#!/usr/bin/env node
/**
 * kpi.mjs — LAS MÉTRICAS DEL DESARROLLO. No son las del ERP.
 *
 * El Autonomy Rate de XSAS mide si el producto contesta solo. Acá se mide otra cosa: **si la
 * construcción del OS puede seguir cuando Claude no está.** Son sistemas distintos y las métricas
 * no se mezclan; usar una para declarar el éxito de la otra sería exactamente la trampa que este
 * repo ya pagó tres veces.
 *
 * CLAUDE DEVELOPMENT OFFLOAD RATE
 *   numerador   tareas ELEGIBLES terminadas correctamente SIN Claude (verificador en verde)
 *   denominador tareas ELEGIBLES (las que no son D3; una D3 no es «no offloadeada», es que nunca
 *               se pretendió sacarla de Claude — meterla en el denominador inflaría el numerador
 *               por el lado fácil)
 *
 * Se calcula SOBRE LA BITÁCORA, o sea sobre tareas que de verdad corrieron. Si son tres, el
 * porcentaje se imprime igual pero con su n al lado: un 100% sobre n=1 no es un 100%.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export const ELEGIBLE = (r) => r !== 'D3'
const TERMINADA_SIN_CLAUDE = new Set(['aceptada', 'reparada'])

export function leerBitacora(raiz) {
  const f = path.join(raiz, '.claude', 'estado', 'dev-router.jsonl')
  if (!existsSync(f)) return []
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

export function kpis(filas) {
  const elegibles = filas.filter((f) => ELEGIBLE(f.riesgo))
  const sinClaude = elegibles.filter((f) => TERMINADA_SIN_CLAUDE.has(f.estado))
  const porModelo = new Map()
  for (const f of filas) {
    for (const p of f.pasos ?? []) {
      if (p.ejecutor !== 'hf' || !p.modelo) continue
      const v = porModelo.get(p.modelo) ?? { intentos: 0, verificacionesVerdes: 0, ms: 0, costoUsd: 0, tokens: 0, bloqueosPolitica: 0 }
      v.intentos += 1
      v.ms += p.ms || 0
      v.costoUsd += p.costoUsd || 0
      v.tokens += (p.uso?.prompt_tokens || 0) + (p.uso?.completion_tokens || 0)
      if (p.bloqueadoPorPolitica) v.bloqueosPolitica += 1
      if ((p.verificacion ?? []).length && p.verificacion.every((x) => x.verde)) v.verificacionesVerdes += 1
      porModelo.set(p.modelo, v)
    }
  }
  return {
    tareas: filas.length,
    elegibles: elegibles.length,
    sinClaude: sinClaude.length,
    offloadRate: elegibles.length ? sinClaude.length / elegibles.length : null,
    n: elegibles.length,
    escaladas: filas.filter((f) => f.estado === 'escalada-a-claude').length,
    bloqueadasEsperandoClaude: filas.filter((f) => f.estado === 'bloqueada-espera-claude').length,
    rechazadas: filas.filter((f) => f.estado === 'rechazada').length,
    reparaciones: filas.reduce((s, f) => s + (f.reparaciones || 0), 0),
    costoHFUsd: filas.reduce((s, f) => s + (f.costoUsd || 0), 0),
    msTotal: filas.reduce((s, f) => s + (f.ms || 0), 0),
    porRiesgo: ['D0', 'D1', 'D2', 'D3'].map((r) => ({ riesgo: r, tareas: filas.filter((f) => f.riesgo === r).length,
      sinClaude: filas.filter((f) => f.riesgo === r && TERMINADA_SIN_CLAUDE.has(f.estado)).length })),
    porModelo: Object.fromEntries(porModelo),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = kpis(leerBitacora(process.cwd()))
  const pct = k.offloadRate == null ? 's/d' : `${(k.offloadRate * 100).toFixed(1)}% (n=${k.n})`
  console.log('KPIs DE DESARROLLO — Dev Router (NO son los del ERP)\n')
  console.log(`CLAUDE DEVELOPMENT OFFLOAD RATE ....... ${pct}`)
  console.log(`  tareas corridas ..................... ${k.tareas}  (elegibles ${k.elegibles}, D3 excluidas del denominador)`)
  console.log(`  terminadas sin Claude ............... ${k.sinClaude}`)
  console.log(`  bloqueadas esperando a Claude ....... ${k.bloqueadasEsperandoClaude}`)
  console.log(`  escaladas / rechazadas .............. ${k.escaladas} / ${k.rechazadas}`)
  console.log(`  reparaciones ........................ ${k.reparaciones}`)
  console.log(`  costo HF real (estimado por tarifa) . US$ ${k.costoHFUsd.toFixed(6)}`)
  console.log(`  tiempo total ........................ ${(k.msTotal / 1000).toFixed(1)} s`)
  console.log('\nPOR RIESGO'); console.table(k.porRiesgo)
  console.log('POR MODELO'); console.table(k.porModelo)
}
