#!/usr/bin/env node
// LE PONE TIPO DE TAREA A LA EXPERIENCIA HISTÓRICA — para que se pueda volver a usar.
//
//   node orquestador/scripts/xsas-clasificar-actividades.mjs            muestra qué haría, no escribe
//   node orquestador/scripts/xsas-clasificar-actividades.mjs --aplicar  asigna
//   ... --sin-modelo                                                    sólo lo determinístico
//
// ═══ QUÉ HACE ACÁ QUE EL TIMER NO HACE ═══
//
// El paso determinístico es EL MISMO que corre el ciclo de XSAS cuatro veces por día
// (`clasificar-borde.mjs`): reglas, similitud y las señales de la obra. Lo único que agrega este
// script es la zona gris —lo que tiene señal y no certeza— en UNA llamada con todos los casos
// juntos, y su decisión NO se asigna: queda como propuesta, marcada, deshacible, esperando a una
// persona. Nunca convierte una inferencia en dato maestro sin decir que lo es.
//
// Y si el proveedor no contesta, el script sigue haciendo todo lo determinístico: la zona gris
// queda sin clasificar, que es exactamente donde estaba.

import { query, closePool } from '../lib/db.mjs'
import { pedirTexto } from '../lib/ia/cliente.mjs'
import { CAPACIDAD } from '../lib/ia/capacidad.mjs'
import { decisionDelModelo } from '../lib/clasificar-actividades.mjs'
import { clasificarPorRegla, proponer } from '../lib/clasificar-borde.mjs'

const APLICAR = process.argv.includes('--aplicar')
const SIN_MODELO = process.argv.includes('--sin-modelo')

async function preguntarAlModelo(grises) {
  const lista = grises.map((g, i) => {
    const cs = g.decision.candidatas.map((c) => `      ${c.tareaTipoId} · ${c.nombre} [${c.unidad ?? '?'}] (${c.similitud.toFixed(2)})`).join('\n')
    const contexto = [g.seccion ? `frente: ${g.seccion}` : null, g.obra ? `obra: ${g.obra}` : null]
      .filter(Boolean).join(' · ')
    return `${i + 1}. ACTIVIDAD: "${g.nombre}"${g.unidad ? ` [${g.unidad}]` : ''}${contexto ? `\n    ${contexto}` : ''}\n    candidatas:\n${cs}`
  }).join('\n')

  const sistema = [
    'Clasificás actividades de obra de una constructora de San Juan, Argentina, contra el catálogo de tareas de su Base Maestra.',
    'Para cada actividad elegís UNA de las candidatas que se te dan, o "ninguna".',
    'REGLA DURA: elegís sólo si la actividad ES esa tarea, no si "se parece". Un nombre parecido con un trabajo distinto es "ninguna".',
    'Si la actividad es más específica o más general que la candidata y no son la misma unidad de trabajo, es "ninguna".',
    '"ninguna" es una respuesta correcta y esperada: una actividad sin clasificar no hace daño, una mal clasificada contamina el rendimiento de esa tarea y después una cotización.',
    'Además de elegir, declarás la certeza: "misma_tarea" si la actividad ES esa tarea del catálogo, o "parecida" si sólo se le parece, es una parte de ella, o es más amplia. SÓLO se acepta "misma_tarea": "parecida" equivale a no clasificar.',
    'Respondés SÓLO un array JSON: [{"n":1,"tarea_tipo_id":"<uuid o ninguna>","certeza":"misma_tarea|parecida","motivo":"<una línea>"}]. Sin texto alrededor.',
  ].join(' ')

  const r = await pedirTexto({
    capacidad: CAPACIDAD.NORMAL,
    sistema,
    mensajes: [{ role: 'user', content: lista }],
    maxTokens: 4096,
    agente: 'xsas',
    funcion: 'clasificar-actividades',
  })
  const m = String(r.texto).match(/\[[\s\S]*\]/)
  if (!m) throw new Error('el modelo no devolvió un array JSON')
  return JSON.parse(m[0])
}

/** La zona gris, resuelta por el modelo y guardada como PROPUESTA. Devuelve las que propuso. */
async function resolverZonaGris(grises) {
  console.log(`[modelo] ${grises.length} casos en zona gris — una sola llamada`)
  let respuestas = []
  try {
    respuestas = await preguntarAlModelo(grises)
  } catch (e) {
    console.log(`[modelo] no se pudo consultar (${String(e.message).slice(0, 80)}): la zona gris queda sin clasificar`)
    return []
  }
  const propuestas = []
  for (const [i, g] of grises.entries()) {
    const x = respuestas.find((y) => Number(y.n) === i + 1)
    if (!x) continue
    const decision = decisionDelModelo(x, g.decision.candidatas)
    if (!decision.tareaTipoId) continue
    propuestas.push({ ...g, decision })
    if (APLICAR) await proponer({ query }, { ...g, decision })
  }
  return propuestas
}

async function main() {
  const c = await clasificarPorRegla({ query }, { aplicar: APLICAR })
  const grises = c.filas.filter((f) => f.decision.veredicto === 'ZONA GRIS')
  const propuestas = grises.length && !SIN_MODELO ? await resolverZonaGris(grises) : []

  console.log(`\nCLASIFICACIÓN DE ACTIVIDADES${APLICAR ? '' : ' (ENSAYO — no escribe)'}\n`)
  console.log(`  ${c.miradas} actividades sin clasificar`)
  for (const [v, n] of Object.entries(c.porVeredicto).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} ${v}`)
  }

  console.log(`\n  ${c.asignadas} ${APLICAR ? 'ASIGNADAS' : 'se asignarían'} (por regla):`)
  for (const r of c.filas.filter((f) => f.decision.tareaTipoId)) {
    console.log(`     [${r.decision.confianza}] ${r.nombre}  →  ${r.decision.evidencia?.candidata ?? '?'}`)
    console.log(`               ${r.decision.porQue}`)
  }

  console.log(`\n  ${propuestas.length} ${APLICAR ? 'PROPUESTAS' : 'se propondrían'} (las decidió el modelo; las acepta una persona):`)
  for (const r of propuestas) {
    console.log(`     ${r.nombre}  →  ${r.decision.evidencia?.candidata ?? '?'}   · ${r.decision.porQue}`)
  }

  // LO QUE NO SE PUDO CLASIFICAR NO SE ESCONDE. Cada AMBIGUO tiene su motivo escrito, y esos
  // motivos son la materia prima de las propuestas de tarea maestra que abre el ciclo.
  const ambiguas = c.filas.filter((f) => f.decision.veredicto === 'AMBIGUO')
  console.log(`\n  ${ambiguas.length} AMBIGUAS — se dejan sin clasificar a propósito:`)
  for (const r of ambiguas.slice(0, 20)) console.log(`     ${r.obraId} · ${r.nombre}: ${r.decision.porQue}`)
  console.log()
  return 0
}

const codigo = await main().catch((e) => { console.error('✖', e?.message ?? e); return 1 })
await closePool()
process.exit(codigo)
