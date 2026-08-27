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

  if (e.empresa) {
    const m = e.empresa
    console.log(`\n  ECHEGARAY   ${m.obras} obras (${m.activas} activas) · ${m.clientes} clientes · ${m.con_avance} con avance medido`)
    console.log(`              ${m.actividades} actividades · ${m.con_plan} con plan · ${m.con_real} con real · ${m.comparables} comparables plan↔real`)
    const r = m.rendimientos ?? {}
    console.log(`              rendimientos: ${r.REFERENCIA ?? 0} de referencia · ${r.CANDIDATO ?? 0} candidatos · ${r.VALIDADO ?? 0} validados`)
    if (!r.VALIDADO) {
      console.log('                 — validar pide DOS obras distintas con la misma tarea. Todavía no pasó.')
    }
    for (const c of m.circuitos ?? []) {
      const cuenta = c.hechos == null ? `no se pudo leer (${c.noSePudoLeer})` : `${c.hechos} hechos`
      console.log(`              ${String(c.dominio).padEnd(12)} ${cuenta.padEnd(18)} ${c.ultimo ? `último ${String(c.ultimo).slice(0, 16)}` : 'sin fecha'}`)
    }
  }

  if (e.conocimiento) {
    const t = e.conocimiento.porTipo ?? {}
    console.log(`\n  APRENDIDO   ${e.conocimiento.afirmaciones} afirmaciones · ${e.conocimiento.retiradas} retiradas`)
    console.log(`              ${t.HECHO ?? 0} HECHO · ${t.VALIDADO ?? 0} VALIDADO · ${t.CANDIDATO ?? 0} CANDIDATO · ${t.INFERENCIA ?? 0} INFERENCIA (salida de un modelo, no es un dato)`)
    for (const a of e.conocimiento.porArea.slice(0, 6)) {
      console.log(`              ${String(a.area ?? '(sin área)').padEnd(24)} ${String(a.afirmaciones).padStart(4)}  (${a.confirmadas} confirmadas)`)
    }
  }

  if (e.trabajos) {
    console.log(`\n  TRABAJO     ${e.trabajos.activos} activos · ${e.trabajos.completados} completados · ${e.trabajos.trabados} trabados esperando a una persona`)
  }

  if (e.costo) {
    const $ = (x) => (x == null ? 'sin precio' : `U$S ${Number(x).toFixed(4)}`)
    console.log(`\n  COSTO       ${e.costo.llamadas} llamadas en ${e.costo.ventana} · ${$(e.costo.usd)}`)
    if (e.costo.sinAtribuir) {
      console.log(`              ▲ ${e.costo.sinAtribuir} llamadas (${$(e.costo.usdSinAtribuir)}) NO dicen qué agente las pidió`)
      console.log('                 — son las del camino viejo, que no atribuye. Es lo que falta migrar a la puerta.')
    }
    for (const a of e.costo.porAgente.slice(0, 6)) {
      const f = a.fallidas ? ` · ${a.fallidas} fallidas` : ''
      console.log(`              ${String(a.agente).slice(0, 14).padEnd(15)} ${String(a.funcion).slice(0, 14).padEnd(15)} ${String(a.llamadas).padStart(4)} llam  ${$(a.usd)}${f}`)
    }
  }

  console.log('\n  SIN RAZONADOR SIGUE ANDANDO:')
  for (const x of e.sinRazonador) console.log(`     · ${x}`)
  console.log()
}

// El pool de Postgres deja el proceso vivo si no se cierra.
try { const { closePool } = await import('../lib/db.mjs'); await closePool() } catch { /* la base no estaba */ }
