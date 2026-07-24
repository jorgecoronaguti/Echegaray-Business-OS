#!/usr/bin/env node
// EL REGISTRO DEL BACKLOG — mínimo, persistente, y la única fuente del estado de cada tarea.
//
// POR QUÉ EXISTE. La regla del dueño es que ninguna tarea puede quedar abandonada sin estado ni
// saltar arbitrariamente a otra. Eso no se cumple con buena voluntad: si el estado vive sólo en mi
// contexto, un /compact o una sesión nueva lo borra y una tarea bloqueada desaparece sin que nadie
// se entere. Acá vive en disco, se lee con un comando y sobrevive a todo.
//
// NO DUPLICA NADA. No es una cola de trabajo (esa es `orq.*` en Postgres, para el worker autónomo)
// ni un gestor de tickets: es el cuaderno de UNA corrida de /backlog, con su DAG y sus worktrees.
// Se guarda en `.claude/backlog/estado.json`, fuera de git.
//
//   node .claude/hooks/backlog.mjs init '<json de tareas>'
//   node .claude/hooks/backlog.mjs estado [ID] [NUEVO_ESTADO] [--nota "..."] [--rama X] [--worktree Y]
//   node .claude/hooks/backlog.mjs listas          → las que YA pueden arrancar (deps completas)
//   node .claude/hooks/backlog.mjs ver             → el tablero
//   node .claude/hooks/backlog.mjs pendientes      → sale 1 si queda algo sin cerrar

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROY = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(PROY, '.claude', 'backlog')
const ARCHIVO = join(DIR, 'estado.json')

export const ESTADOS = ['PENDIENTE', 'LISTA', 'EN_EJECUCIÓN', 'EN_VALIDACIÓN', 'BLOQUEADA', 'COMPLETADA', 'CANCELADA']
/** Los estados que cierran una tarea. Todo lo demás sigue vivo y tiene que verse. */
export const TERMINALES = ['COMPLETADA', 'CANCELADA']

const leer = () => { try { return JSON.parse(readFileSync(ARCHIVO, 'utf8')) } catch { return { creado: null, tareas: [] } } }
const guardar = (d) => { mkdirSync(DIR, { recursive: true }); writeFileSync(ARCHIVO, JSON.stringify(d, null, 2)) }
// Antes de tocar el tablero se guarda una copia del estado actual. Si algo sale mal, el estado
// previo —tareas, estados, ramas, worktrees, resultados, bloqueos— se puede recuperar. Nunca se
// pisa un tablero existente sin dejar respaldo.
const respaldar = () => {
  try {
    mkdirSync(DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    writeFileSync(join(DIR, `estado.backup-${stamp}.json`), readFileSync(ARCHIVO, 'utf8'))
  } catch { /* no había estado.json todavía: no hay nada que respaldar */ }
}

/**
 * NÚCLEO PURO: qué tareas pueden arrancar ahora.
 *
 * Una tarea está LISTA cuando no está terminada, no está en curso, y TODAS sus dependencias están
 * COMPLETADAS. Una dependencia BLOQUEADA no habilita nada: propaga el bloqueo hacia abajo, que es lo
 * correcto — arrancar una tarea cuya base no existe es garantizar trabajo tirado.
 */
export function listas(tareas = []) {
  const porId = new Map(tareas.map((t) => [t.id, t]))
  return tareas.filter((t) => {
    if (TERMINALES.includes(t.estado) || t.estado === 'EN_EJECUCIÓN' || t.estado === 'EN_VALIDACIÓN' || t.estado === 'BLOQUEADA') return false
    return (t.depende_de ?? []).every((d) => porId.get(d)?.estado === 'COMPLETADA')
  })
}

/**
 * NÚCLEO PURO: ¿estas dos tareas pueden correr al mismo tiempo?
 *
 * No alcanza con que no dependan una de otra: si tocan el MISMO recurso —un archivo, una pestaña del
 * Sheet, una tabla, una migración— van a chocar aunque el DAG diga que son independientes. Dos
 * agentes reescribiendo la misma pestaña en paralelo producen el defecto que este repo ya conoce de
 * memoria: dos dueños sobre un mismo recurso, y gana el último que corre.
 */
export function chocan(a, b) {
  const ra = new Set([...(a.recursos ?? [])])
  return (b.recursos ?? []).some((r) => ra.has(r))
}

/** NÚCLEO PURO: un lote que puede correr junto, respetando el tope de concurrencia. */
export function lote(tareas = [], tope = 3) {
  const out = []
  for (const t of listas(tareas)) {
    if (out.length >= tope) break
    if (out.some((y) => chocan(t, y))) continue   // conflicto de recursos: va en otra tanda
    out.push(t)
  }
  return out
}

const ICONO = {
  PENDIENTE: '·', LISTA: '○', 'EN_EJECUCIÓN': '▸', 'EN_VALIDACIÓN': '⧗',
  BLOQUEADA: '✋', COMPLETADA: '✓', CANCELADA: '✗',
}

function tablero(d) {
  if (!d.tareas.length) return 'No hay ningún backlog cargado.'
  const L = [`BACKLOG · ${d.tareas.length} tarea(s) · tope de concurrencia ${d.tope ?? 3}`, '']
  for (const t of d.tareas) {
    L.push(`${ICONO[t.estado] ?? '?'} ${t.id.padEnd(6)} ${t.estado.padEnd(14)} ${t.titulo}`)
    if (t.depende_de?.length) L.push(`         depende de: ${t.depende_de.join(', ')}`)
    if (t.rama) L.push(`         rama ${t.rama}${t.worktree ? ` · worktree ${t.worktree}` : ''}`)
    if (t.recursos?.length) L.push(`         toca: ${t.recursos.join(', ')}`)
    if (t.validaciones) L.push(`         validaciones: ${t.validaciones}`)
    if (t.bloqueo) L.push(`         ✋ BLOQUEO: ${t.bloqueo}`)
    if (t.resultado) L.push(`         → ${t.resultado}`)
  }
  const abiertas = d.tareas.filter((t) => !TERMINALES.includes(t.estado))
  L.push('', abiertas.length ? `${abiertas.length} sin cerrar: ${abiertas.map((t) => `${t.id}(${t.estado})`).join(' ')}` : 'Todas cerradas.')
  return L.join('\n')
}

const [, , cmd, ...args] = process.argv
const d = leer()

if (cmd === 'init') {
  // INIT IDEMPOTENTE Y ADITIVO (24/07). Antes `init` PISABA el tablero entero: dos /backlog seguidos
  // borraban las tareas del primero (estados, ramas, worktrees, resultados, bloqueos). Regla del dueño:
  // un tablero existente es la FUENTE DE VERDAD y no se reemplaza por inferencias. `init` sólo AGREGA lo
  // que falta —por id— y CONSERVA intacta cualquier tarea que ya exista. Correr `init` dos veces con el
  // mismo set no cambia ni borra nada.
  const hayTablero = Boolean(d.creado) || d.tareas.length > 0
  const yaExiste = new Map(d.tareas.map((t) => [t.id, t]))
  const nuevas = []
  const conservadas = []
  JSON.parse(args[0] ?? '[]').forEach((t, i) => {
    const id = t.id ?? `T${String(i + 1).padStart(2, '0')}`
    if (yaExiste.has(id)) { conservadas.push(id); return } // ya existe: NO se toca (su estado manda)
    nuevas.push({
      id,
      titulo: t.titulo,
      criterio: t.criterio ?? null,          // cómo se sabe que está terminada
      estado: 'PENDIENTE',
      depende_de: t.depende_de ?? [],
      recursos: t.recursos ?? [],            // archivos/pestañas/tablas que toca
      agente: null, rama: null, worktree: null,
      inicio: null, ultimo_avance: null, validaciones: null, bloqueo: null, resultado: null,
    })
  })
  if (hayTablero) respaldar()               // nunca se toca un tablero existente sin respaldo
  guardar({
    creado: d.creado ?? new Date().toISOString(),                       // se conserva la fecha original
    tope: hayTablero ? (d.tope ?? (Number(args[1]) || 3)) : (Number(args[1]) || 3), // el tope existente manda
    tareas: [...d.tareas, ...nuevas],                                    // se AGREGA, nunca se reemplaza
  })
  console.log(`init idempotente: ${nuevas.length} tarea(s) nueva(s)${nuevas.length ? ' (' + nuevas.map((t) => t.id).join(', ') + ')' : ''}` +
    `${conservadas.length ? ` · ${conservadas.length} ya existían y se conservaron (${conservadas.join(', ')})` : ''}.`)
  console.log(tablero(leer()))
} else if (cmd === 'estado') {
  const [id, nuevo] = args
  const t = d.tareas.find((x) => x.id === id)
  if (!t) { console.error(`no existe la tarea ${id}`); process.exit(1) }
  if (nuevo && !ESTADOS.includes(nuevo)) { console.error(`estado inválido: ${nuevo}. Válidos: ${ESTADOS.join(', ')}`); process.exit(1) }
  if (nuevo) {
    // NO SE PUEDE COMPLETAR SIN VALIDACIÓN. Es la regla que impide dar por terminado algo porque se
    // escribió código: tiene que haber pasado su cierre, y ese cierre queda escrito.
    if (nuevo === 'COMPLETADA' && !t.validaciones) {
      console.error(`${id} no puede quedar COMPLETADA sin validaciones registradas.`)
      console.error('Registrá primero qué corriste:  backlog.mjs estado ' + id + ' EN_VALIDACIÓN --validaciones "orq:test 454 OK · typecheck OK · eslint 0 errores"')
      process.exit(1)
    }
    if (nuevo === 'BLOQUEADA' && !args.includes('--bloqueo')) {
      console.error(`${id} no puede quedar BLOQUEADA sin causa. Usá --bloqueo "causa · qué intenté · qué necesito · cómo dejé el worktree"`)
      process.exit(1)
    }
    if (nuevo === 'EN_EJECUCIÓN' && !t.inicio) t.inicio = new Date().toISOString()
    t.estado = nuevo
  }
  for (const k of ['nota', 'rama', 'worktree', 'agente', 'validaciones', 'bloqueo', 'resultado', 'criterio']) {
    const i = args.indexOf(`--${k}`)
    if (i >= 0 && args[i + 1] !== undefined) t[k === 'nota' ? 'ultimo_avance' : k] = args[i + 1]
  }
  t.ultimo_avance = t.ultimo_avance || new Date().toISOString()
  guardar(d)
  console.log(tablero(d))
} else if (cmd === 'listas') {
  console.log(JSON.stringify(lote(d.tareas, d.tope ?? 3), null, 2))
} else if (cmd === 'pendientes') {
  const abiertas = d.tareas.filter((t) => !TERMINALES.includes(t.estado))
  console.log(abiertas.length ? abiertas.map((t) => `${t.id} ${t.estado} ${t.titulo}`).join('\n') : '')
  process.exit(abiertas.length ? 1 : 0)
} else if (cmd === 'ver' || !cmd) {
  console.log(tablero(d))
} else {
  console.error('comandos: init | estado | listas | pendientes | ver')
  process.exit(1)
}
