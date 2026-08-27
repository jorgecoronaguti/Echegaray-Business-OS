#!/usr/bin/env node
// ¿EN QUÉ ESTADO ESTÁ LA INTELIGENCIA DEL OS? — en un comando y sin gastar un token.
//
//   node orquestador/scripts/xsas-estado.mjs           el cuadro completo
//   node orquestador/scripts/xsas-estado.mjs --linea    una línea, para un log o un healthcheck
//   node orquestador/scripts/xsas-estado.mjs --json     para otro programa
//
// Contesta igual con el proveedor apagado, y ahí es cuando importa que conteste: si describir el
// estado de la inteligencia necesitara la inteligencia, no habría forma de saber que está caída.

import { estadoDeXsas, resumirEstado, NIVEL } from '../lib/xsas.mjs'

const e = await estadoDeXsas()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(e, null, 2))
} else if (process.argv.includes('--linea')) {
  console.log(resumirEstado(e))
} else {
  const marca = { [NIVEL.FULL]: '✔', [NIVEL.DEGRADED]: '▲', [NIVEL.NO_LLM]: '⊘' }[e.nivel]
  console.log(`\n${marca} XSAS · ${e.nivel} — la inteligencia del ${e.de}\n`)

  console.log(`  MOTOR       ${e.motor.disponible ? 'disponible' : `CAÍDO desde ${e.motor.sinCreditoDesde ?? 'hace rato'}`}`)
  console.log(`              puerta única: ${e.motor.puerta}`)
  console.log(`              simple→${e.motor.porCapacidad.simple} · normal→${e.motor.porCapacidad.normal} · complex→${e.motor.porCapacidad.complex}`)

  if (e.agentes) {
    console.log(`\n  AGENTES     ${e.agentes.total} en orq.agents · ${e.agentes.habilitados} habilitados`)
    console.log(`              ${e.agentes.deNegocio} del negocio · ${e.agentes.delBuilder} del Builder`)
    console.log(`              ${e.agentes.conClaudeCode} razonan con Claude Code (deben ser sólo los ${e.agentes.delBuilder} del Builder)`)
  } else {
    console.log(`\n  AGENTES     ▲ no se pudo leer la base: ${e.noSePudoLeer ?? 'sin motivo'}`)
  }

  console.log(`\n  CAPACIDAD   ${e.herramientas} herramientas propias · ${e.skills} skills de dominio`)

  if (e.conocimiento) {
    console.log(`\n  APRENDIDO   ${e.conocimiento.afirmaciones} afirmaciones · ${e.conocimiento.confirmadas} confirmadas ≥2 veces · ${e.conocimiento.retiradas} retiradas`)
    for (const a of e.conocimiento.porArea.slice(0, 6)) {
      console.log(`              ${String(a.area ?? '(sin área)').padEnd(24)} ${String(a.afirmaciones).padStart(4)}  (${a.confirmadas} confirmadas)`)
    }
  }

  if (e.trabajos) {
    console.log(`\n  TRABAJO     ${e.trabajos.activos} activos · ${e.trabajos.completados} completados · ${e.trabajos.trabados} trabados esperando a una persona`)
  }

  console.log('\n  SIN RAZONADOR SIGUE ANDANDO:')
  for (const x of e.sinRazonador) console.log(`     · ${x}`)
  console.log()
}

// El pool de Postgres deja el proceso vivo si no se cierra.
try { const { closePool } = await import('../lib/db.mjs'); await closePool() } catch { /* la base no estaba */ }
