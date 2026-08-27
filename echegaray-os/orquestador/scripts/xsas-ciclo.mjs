#!/usr/bin/env node
// EL CICLO DE XSAS — clasificar, observar, comparar, aprender, y pedir lo que falta.
//
//   node orquestador/scripts/xsas-ciclo.mjs --dry     muestra qué haría, no escribe
//   node orquestador/scripts/xsas-ciclo.mjs           corre
//   node orquestador/scripts/xsas-ciclo.mjs --json    para otro programa
//
// ═══ POR QUÉ NO NECESITA A NADIE ═══
//
// Corre por timer sobre lo que los partes de obra y las horas cargadas ya dejaron en la base. No
// pregunta, no espera una orden y no abre un chat: cuando alguien carga un parte, el rendimiento de
// esa actividad queda medido en la siguiente corrida.
//
// ═══ Y POR QUÉ NO GASTA UN TOKEN, NI SIQUIERA PARA CLASIFICAR ═══
//
// El paso de clasificación que corre acá es SÓLO el determinístico: reglas, similitud y las señales
// de la obra. La zona gris —lo que tiene señal y no certeza— no se toca desde el timer y espera al
// script de a mano, que sí puede consultar un modelo y deja su respuesta como PROPUESTA. Una
// inferencia que entra sola a la base cuatro veces por día no la revisa nadie, y el dato maestro es
// justamente donde no se puede acumular ruido sin que se note.
//
// Con el proveedor caído, todo esto corre igual: es aritmética y SQL sobre datos propios.

import { query, closePool } from '../lib/db.mjs'
import { aprender, aprenderDuracion } from '../lib/xsas-aprendizaje.mjs'
import { aprenderDotacion } from '../lib/xsas-dotacion.mjs'
import { clasificarPorRegla } from '../lib/clasificar-borde.mjs'
import { agrupar, proponerTareasMaestras } from '../lib/tareas-maestras-propuestas.mjs'

const DRY = process.argv.includes('--dry')
const JSON_OUT = process.argv.includes('--json')

const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)
const hs = (x) => (x == null ? '—' : x.toFixed(4))

// 1 · CLASIFICAR primero: una actividad que gana su tipo en esta corrida ya aprende en esta corrida.
const c = await clasificarPorRegla({ query }, { aplicar: !DRY })
// 2 · APRENDER las tres métricas. Cada una corre aunque las otras dos no tengan con qué.
const r = await aprender({ query }, { dry: DRY })
const d = await aprenderDuracion({ query }, { dry: DRY })
const o = await aprenderDotacion({ query }, { dry: DRY })
// 3 · PEDIR lo que falta: las que ninguna regla pudo clasificar agrupadas por tarea, y las que se
//     repiten lo suficiente van al backlog como propuesta de tarea maestra. Nunca se crean solas.
const p = await proponerTareasMaestras({ query }, agrupar(c.sinResolver), { dry: DRY })

if (JSON_OUT) {
  console.log(JSON.stringify({ clasificacion: c, rendimiento: r, duracion: d, dotacion: o, tareasMaestras: p }, null, 2))
} else {
  console.log(`\nXSAS · ciclo de obra${DRY ? ' (ENSAYO — no escribe)' : ''}\n`)
  console.log(`  CLASIFICACIÓN — ${c.miradas} actividades sin tipo · ${c.asignadas} ${DRY ? 'se asignarían' : 'asignadas'} por regla`)
  for (const [v, n] of Object.entries(c.porVeredicto).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(4)} ${v}`)
  }
  for (const f of c.filas.filter((x) => x.decision.tareaTipoId)) {
    console.log(`     [${f.decision.confianza}] ${f.obraId} · ${f.nombre} → ${f.decision.evidencia?.candidata ?? '?'}`)
    console.log(`            ${f.decision.porQue}`)
  }

  console.log(`\n  RENDIMIENTO — ${r.miradas} actividades con algún dato real · ${r.aprendidas} enseñan un rendimiento`)
  console.log(`     ${r.validadas} VALIDADAS · ${r.candidatas} CANDIDATAS`)
  if (r.sinTipoDeTarea) {
    console.log(`     ▲ ${r.sinTipoDeTarea} rindieron un número pero no dicen de qué tarea son: no se pueden reutilizar.`)
  }
  for (const f of r.filas) {
    const x = f.obs
    console.log(`     [${f.veredicto.estado}·${f.veredicto.confianza}] ${x.obra} — ${x.tarea}`)
    console.log(`         real ${hs(x.hsUnitarias)} hs/${x.unidad ?? '?'}  ·  plan ${hs(x.hsUnitariasPlan)}  ·  desvío ${pct(x.derivado.desvioProductividadPct)}  ·  avance ${x.avancePct?.toFixed(0) ?? '—'}%`)
    console.log(`         ${f.veredicto.porQue}`)
    if (x.faltantes.length) console.log(`         falta: ${x.faltantes.join(' · ')}`)
  }

  console.log(`\n  DURACIÓN — ${d.medidas} actividades terminadas con plan y real · ${d.validadas} VALIDADAS · ${d.tardaronMas} tardaron más`)
  if (d.descartadasSinPlan) console.log(`     ▲ ${d.descartadasSinPlan} terminadas quedaron afuera: su plan era de cero días y contra cero no hay desvío.`)
  if (d.sinTipo) console.log(`     ▲ ${d.sinTipo} sin tipo de tarea: el hecho se guarda, pero no se puede reutilizar en otra obra todavía.`)
  if (d.retiradasPorNoSerTrabajo) console.log(`     ▲ ${d.retiradasPorNoSerTrabajo} se retiraron: la actividad pasó a agrupar a otras y su duración ya no es la de una tarea.`)

  console.log(`\n  DOTACIÓN — ${o.medidas} actividades con personas que imputaron horas · ${o.validadas} VALIDADAS`)
  console.log(`     ${o.conPlan} tienen dotación prevista con la cual compararse`)
  if (o.sinHorasImputadas) {
    console.log(`     ▲ ${o.sinHorasImputadas} actividades sin una sola hora imputada: no se puede saber quién estuvo.`)
    console.log('        — «nadie imputó» NO es «trabajaron cero personas», y la asignación no prueba presencia.')
  }
  if (o.retiradasPorNoSerTrabajo) console.log(`     ▲ ${o.retiradasPorNoSerTrabajo} se retiraron: la actividad pasó a agrupar a otras.`)
  console.log('     ⊘ COSTO por actividad: no disponible. costos_reales se imputa por obra.')

  console.log(`\n  BASE MAESTRA — ${p.grupos} tareas distintas sin clasificar · ${p.propuestas} propuestas`)
  if (p.yaDecididas) console.log(`     ${p.yaDecididas} ya las decidió una persona: no se vuelven a abrir.`)
  for (const x of p.filas.filter((y) => y.accion !== 'ya decidida')) {
    console.log(`     [${x.impacto}·${x.accion}] ${x.titulo}`)
  }
  console.log()
}

await closePool()
