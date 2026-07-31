// REGISTRO DE ESPECIALISTAS — quién puede atender una conversación del OS.
//
// POR QUÉ EXISTE. El bot `@os` atendía UN caso (asistencia) porque el handler lo tenía
// cableado: un `if`, un import directo del flujo de asistencia y un router que sólo sabía
// esa palabra. Agregar Compras habría exigido tocar la arquitectura. Acá se invierte: la
// capa de comunicación no conoce ningún dominio, y cada especialista se declara a sí mismo.
//
// CONTRATO de un especialista (un archivo en `especialistas/`):
//   export const especialista = {
//     slug:        'personal',            // identidad estable
//     agentSlug:   'rrhh',                // fila en orq.agents (el especialista del OS)
//     area:        'personas',            // clave en public.area_canonica
//     titulo:      'Personal IA',
//     descripcion: '…',                   // se la lee el Director para decidir
//     ejemplos:    ['registrar asistencia', 'quién trabajó ayer'],
//     reconoce(texto, ctx) -> null | { intencion, confianza }   ← la GRAMÁTICA es suya
//     atender({ texto, actor, ... })      -> { texto, estado, privado }
//     operativo: true                     // false = declarado pero sin capacidad todavía
//     preferidoDeArea: true               // false = sólo atiende por reclamo, no por canal
//   }
//
// `reconoce` vive en el especialista y no en el router a propósito: "3 ausente" es
// vocabulario de personal, no de la capa de comunicación. El día que exista Compras, su
// gramática viaja con él y nadie toca este archivo ni el handler.
//
// DESCUBRIMIENTO POR DIRECTORIO: no hay lista hardcodeada. Se lee `especialistas/*.mjs`.
// Agregar uno es dejar el archivo; sacarlo es borrarlo.

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR = join(AQUI, 'especialistas')

/** Campos sin los cuales un especialista no puede participar del ruteo. */
const OBLIGATORIOS = ['slug', 'agentSlug', 'area', 'titulo', 'descripcion', 'atender']

let cache = null

/**
 * Todos los especialistas declarados, en orden estable por slug.
 * @param {{recargar?:boolean}} [o]
 * @returns {Promise<Array<object>>}
 */
export async function especialistas({ recargar = false } = {}) {
  if (cache && !recargar) return cache
  const archivos = readdirSync(DIR)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .sort()
  const out = []
  for (const f of archivos) {
    const mod = await import(join(DIR, f))
    const e = mod.especialista
    if (!e) throw new Error(`especialistas/${f}: falta el export \`especialista\``)
    const faltan = OBLIGATORIOS.filter((k) => e[k] == null)
    if (faltan.length) throw new Error(`especialistas/${f}: faltan campos ${faltan.join(', ')}`)
    out.push({ operativo: true, ejemplos: [], reconoce: () => null, ...e, archivo: f })
  }
  cache = out
  return out
}

/**
 * El especialista al que se rutea un canal de esta área, o null.
 *
 * Un área puede tener MÁS de un especialista declarado: el asistente conversacional
 * (buscar un archivo, recordar algo) comparte `gestion_general` con el estado del sistema,
 * y son dos cosas distintas. Lo que no puede haber es ambigüedad al rutear un canal, y
 * antes se resolvía por orden alfabético de archivo — o sea, por accidente: renombrar un
 * archivo cambiaba a dónde va el canal.
 *
 * `preferidoDeArea: false` significa "atiendo por reclamo, no por pertenecer al área". Es
 * lo correcto para un especialista transversal: que alguien escriba en el canal de
 * Personal no convierte su mensaje en un pedido de asistente.
 */
export async function especialistaDeArea(area) {
  const todos = await especialistas()
  const delArea = todos.filter((e) => e.area === area)
  if (!delArea.length) return null
  const preferidos = delArea.filter((e) => e.preferidoDeArea !== false)
  if (preferidos.length > 1) {
    throw new Error(`registro de especialistas: el área "${area}" tiene más de un preferido (${preferidos.map((e) => e.slug).join(', ')}); exactamente uno debe quedar como preferido`)
  }
  return preferidos[0] ?? null
}

/** Especialista por slug. */
export async function especialistaPorSlug(slug) {
  const todos = await especialistas()
  return todos.find((e) => e.slug === slug) ?? null
}

/** Catálogo para el Director y para la ayuda: qué sabe hacer hoy el OS por área. */
export async function catalogo() {
  const todos = await especialistas()
  return todos.map((e) => ({
    slug: e.slug, area: e.area, titulo: e.titulo, agente: e.agentSlug,
    descripcion: e.descripcion, ejemplos: e.ejemplos, operativo: e.operativo,
  }))
}
