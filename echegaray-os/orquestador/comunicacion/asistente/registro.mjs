// REGISTRO DE CAPACIDADES del asistente — la única lista de lo que el OS sabe hacer.
//
// El router y la ayuda dinámica leen de ACÁ, y de ningún otro lado. Es la regla que impide
// el defecto clásico del chatbot: una ayuda escrita a mano que promete cosas que el router
// no sabe ejecutar, o un router que ejecuta cosas que la ayuda no menciona. Si divergen es
// porque alguien escribió una segunda lista; no hay una segunda lista.
//
// DESCUBRIMIENTO POR DIRECTORIO, igual que los especialistas: agregar una capacidad es
// dejar un archivo en `capacidades/`; sacarla es borrarlo. No hay un array que actualizar.
//
// HABILITADA ≠ EXISTE. Una capacidad puede estar declarada y no estar disponible para
// ESTE usuario en ESTE momento (Google sin conectar, permiso ausente). La ayuda muestra
// sólo lo habilitado: prometer una capacidad que va a fallar es la forma más barata de
// perder la confianza del que pregunta.

import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR = join(AQUI, 'capacidades')

const OBLIGATORIOS = ['id', 'nombre', 'descripcion', 'version', 'ejecutar', 'entrada']

let cache = null

/** Todas las capacidades declaradas, en orden estable por id. */
export async function capacidades({ recargar = false } = {}) {
  if (cache && !recargar) return cache
  let archivos = []
  try {
    // `_algo.mjs` queda fuera: la carpeta también tiene que poder alojar un helper compartido
    // entre capacidades sin que el registro le exija exportar una capacidad.
    archivos = readdirSync(DIR)
      .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !f.startsWith('_'))
      .sort()
  } catch { archivos = [] }
  const out = []
  for (const f of archivos) {
    const mod = await import(join(DIR, f))
    const c = mod.capacidad
    if (!c) throw new Error(`capacidades/${f}: falta el export \`capacidad\``)
    const faltan = OBLIGATORIOS.filter((k) => c[k] == null)
    if (faltan.length) throw new Error(`capacidades/${f}: faltan campos ${faltan.join(', ')}`)
    out.push({ permisos: [], ejemplos: [], efectoExterno: false, orden: 100, habilitada: async () => true, ...c, archivo: f })
  }
  const ids = out.map((c) => c.id)
  const dup = ids.find((id, i) => ids.indexOf(id) !== i)
  if (dup) throw new Error(`registro de capacidades: id duplicado "${dup}"`)
  // El orden es DECLARADO, no alfabético por nombre de archivo. La ayuda es lo primero que
  // lee alguien que no conoce el OS: que empiece por "agendar" en vez de por "buscar" sólo
  // porque `calendar-` va antes que `drive-` es dejar que el orden lo decida un accidente.
  out.sort((a, b) => (a.orden - b.orden) || a.id.localeCompare(b.id))
  cache = out
  return out
}

/** Una capacidad por id, o null. */
export async function capacidadPorId(id, o) {
  return (await capacidades(o)).find((c) => c.id === id) ?? null
}

/**
 * Las capacidades realmente DISPONIBLES para este contexto. Es lo que responde
 * "¿qué sabés hacer?" y lo que el router puede ejecutar. Si `habilitada` explota, la
 * capacidad se considera NO disponible: en la duda no se ofrece.
 * @returns {Promise<Array<object>>}
 */
export async function capacidadesHabilitadas(ctx) {
  const todas = await capacidades()
  const out = []
  for (const c of todas) {
    let ok = false
    try { ok = (await c.habilitada(ctx)) === true } catch { ok = false }
    if (ok) out.push(c)
  }
  return out
}

/**
 * Catálogo COMPACTO para el modelo (el único lugar donde el catálogo viaja a la API).
 * Sin schemas ni ejemplos largos: id + qué hace, en una línea. Es lo que mantiene el
 * prompt de interpretación en el orden de los cientos de tokens y no de los miles.
 */
export function catalogoCompacto(lista) {
  return lista.map((c) => `${c.id}: ${c.descripcion}`).join('\n')
}

/** Texto de la ayuda dinámica, armado desde el registro. No hay lista escrita a mano. */
export function renderAyuda(lista) {
  if (!lista.length) {
    return 'Ahora mismo no tengo ninguna capacidad habilitada para vos. Avisale a Jorge.'
  }
  return ['Puedo:', ...lista.map((c) => `• ${c.descripcion};`)].join('\n').replace(/;$/, '.')
}
