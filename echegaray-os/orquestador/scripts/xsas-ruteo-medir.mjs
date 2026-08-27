#!/usr/bin/env node
// MEDIR EL RUTEO ANTES Y DESPUÉS — sobre los pedidos REALES del dueño, no un benchmark inventado.
//
// El corpus son los 49 casos de `auditar-ruteo-areas.mjs`: preguntas escritas como las escribe él
// (voseo, sin tildes, abreviadas), cada una con la skill que TIENE que aparecer. Medir contra un
// set sintético mediría el set.
//
// Qué compara:
//   ANTES   el ruteo que corre hoy en el chat: classifyDirectiveMulti + skillsSegunProfundidad.
//   DESPUÉS la política de cuatro niveles: elegirCapacidad + nivelDeRuteo.
//
// Y qué mira, en este orden de importancia:
//   1. COBERTURA — que no se pierda ninguna skill esperada. Menos modelo NO puede significar peor
//      respuesta: si la cobertura baja, la optimización no existe y el script termina en rojo.
//   2. CONTEXTO — cuántos caracteres de SKILL.md se inyectan al prompt (medido de verdad, con el
//      mismo compactado que usa context-assembler), y su costo en tokens (ESTIMACIÓN: chars/4).
//   3. NIVELES — cuánto cae en cada nivel de la política.
//   4. LATENCIA de la decisión de ruteo.
//
// Uso: node orquestador/scripts/xsas-ruteo-medir.mjs [--json]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AREAS } from './auditar-ruteo-areas.mjs'
import { classifyDirectiveMulti } from '../lib/classify-directive.mjs'
import { skillsSegunProfundidad } from '../lib/skill-map.mjs'
import { elegirCapacidad, nivelDeRuteo } from '../lib/elegir-capacidad.mjs'
import { leerCatalogoDeDisco, SKILLS_DIR } from '../lib/skill-catalogo.mjs'
import { compactSkillMd } from '../lib/context-assembler.mjs'

/** Caracteres que cada skill mete de verdad en el prompt del chat (compactada, como en producción). */
async function pesoDeCadaSkill() {
  const fichas = await leerCatalogoDeDisco({})
  const peso = new Map()
  for (const f of fichas) {
    const md = await readFile(path.join(SKILLS_DIR, f.clave, 'SKILL.md'), 'utf8').catch(() => '')
    peso.set(f.clave, compactSkillMd(md).length)
  }
  return peso
}

const casos = Object.entries(AREAS).flatMap(([area, cs]) => cs.map(([pregunta, debe, criterio]) => ({ area, pregunta, debe, criterio: !!criterio })))

/** Misma regla que la auditoría: con varias alternativas alcanza con que aparezca una. */
function cumple(debe, skills) {
  return debe.length > 1 ? debe.some((d) => skills.includes(d)) : debe.every((d) => skills.includes(d))
}

function percentil(valores, p) {
  const v = [...valores].sort((a, b) => a - b)
  return v[Math.min(v.length - 1, Math.floor(v.length * p))]
}

async function main() {
  const peso = await pesoDeCadaSkill()
  const catalogo = await leerCatalogoDeDisco({})
  const chars = (skills) => skills.reduce((n, s) => n + (peso.get(s) || 0), 0)

  const filas = []
  const micros = []
  for (const c of casos) {
    const caps = classifyDirectiveMulti(c.pregunta)
    const antes = skillsSegunProfundidad(caps, c.pregunta, { asesoria: c.criterio })

    const t0 = process.hrtime.bigint()
    const eleccion = elegirCapacidad(c.pregunta, { asesoria: c.criterio })
    micros.push(Number(process.hrtime.bigint() - t0) / 1000)
    const nivel = nivelDeRuteo(catalogo, eleccion)

    filas.push({ ...c, antes, despues: eleccion.skills, nivel, resolucion: eleccion.resolucion,
      okAntes: cumple(c.debe, antes), okDespues: cumple(c.debe, eleccion.skills),
      charsAntes: chars(antes), charsDespues: chars(eleccion.skills) })
  }

  const sum = (k) => filas.reduce((n, f) => n + f[k], 0)
  const cuenta = (pred) => filas.filter(pred).length
  const r = {
    casos: filas.length,
    coberturaAntes: cuenta((f) => f.okAntes),
    coberturaDespues: cuenta((f) => f.okDespues),
    charsAntes: sum('charsAntes'),
    charsDespues: sum('charsDespues'),
    niveles: [0, 1, 2, 3].map((n) => cuenta((f) => f.nivel === n)),
    ambiguos: cuenta((f) => f.resolucion === 'ambiguo'),
    sinMatch: cuenta((f) => f.resolucion === 'sin_match'),
    usMediana: Math.round(percentil(micros, 0.5) * 1000) / 1000,
    usP95: Math.round(percentil(micros, 0.95) * 1000) / 1000,
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ ...r, filas }, null, 2)); return }

  console.log('RUTEO: ANTES vs DESPUÉS — 49 pedidos reales del dueño\n')
  console.log(`  cobertura de la skill esperada : ${r.coberturaAntes}/${r.casos} → ${r.coberturaDespues}/${r.casos}`)
  console.log(`  caracteres de skill inyectados : ${r.charsAntes.toLocaleString('es-AR')} → ${r.charsDespues.toLocaleString('es-AR')}`)
  console.log(`  tokens estimados (chars/4)     : ${Math.round(r.charsAntes / 4).toLocaleString('es-AR')} → ${Math.round(r.charsDespues / 4).toLocaleString('es-AR')}   [ESTIMACIÓN]`)
  console.log(`  llamadas al modelo del RUTEO   : 0 → 0 (${r.ambiguos} casos ambiguos serían la única escalada)`)
  console.log(`  decisión de ruteo              : p50 ${r.usMediana} µs · p95 ${r.usP95} µs`)
  console.log(`\n  Niveles de la política (nivel 0 lo resuelve el chat antes de este ruteo):`)
  const nombre = ['0 determinístico', '1 capacidad XSAS', '2 IA liviana', '3 razonamiento']
  r.niveles.forEach((n, i) => console.log(`    ${nombre[i].padEnd(20)} ${n}`))
  console.log(`    sin match            ${r.sinMatch}`)

  const nuevas = filas.filter((f) => f.despues.some((s) => !f.antes.includes(s)))
  if (nuevas.length) {
    console.log(`\n  Capacidades que ANTES no se alcanzaban (${nuevas.length} pedidos):`)
    for (const f of nuevas) {
      console.log(`    "${f.pregunta}"\n      + ${f.despues.filter((s) => !f.antes.includes(s)).join(', ')}`)
    }
  }
  if (r.coberturaDespues < r.coberturaAntes) {
    console.log('\n  ✖ LA COBERTURA BAJÓ: la política pierde criterio en algún caso. No es optimización.')
    for (const f of filas.filter((x) => x.okAntes && !x.okDespues)) {
      console.log(`    "${f.pregunta}" esperaba ${f.debe.join(' | ')} y cargó ${f.despues.join(', ') || '(nada)'}`)
    }
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
