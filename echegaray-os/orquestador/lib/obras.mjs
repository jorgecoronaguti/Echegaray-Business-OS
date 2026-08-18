// F0.2 EL EJE — resolver de obras. Toda tabla viva guarda la obra como TEXTO suelto con grafías
// distintas. Esto lo resuelve a la obra CANÓNICA (o la clasifica indirecto/excluido) usando la
// tabla public.obra_alias como fuente única (misma que consume la web → una-capacidad-una-fuente).
//
// normObra() SE MUDÓ a ./obra-operacion.mjs y desde acá sólo se reexporta. El motivo es que la web
// necesita la misma regla y este módulo importa db.mjs (driver `pg`): tener dos copias de una
// normalización que decide a qué obra va cada peso ya estaba anotado como mina en este archivo
// ("si cambia una, cambia la otra"). Ahora hay una sola, y obras.test.mjs la sigue cubriendo.
import { query } from './db.mjs'
import { normObra } from './obra-operacion.mjs'

export { normObra }

// Cache del mapa de alias (se refresca solo cada 5 min; la tabla cambia rara vez).
let _cache = null, _cacheAt = 0
const TTL = 5 * 60 * 1000

/** Carga el mapa alias→{obra_id, clasificacion} desde la DB (cacheado). */
export async function cargarAliasMap() {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache
  const { rows } = await query('select alias, obra_id, clasificacion from public.obra_alias')
  const map = new Map()
  for (const r of rows) map.set(r.alias, { obra_id: r.obra_id, clasificacion: r.clasificacion })
  _cache = map; _cacheAt = Date.now()
  return map
}

/** Resuelve un texto de obra crudo. Con `aliasMap` inyectado es PURO (para tests, sin DB).
 *  Devuelve { obra_id, clasificacion, alias, resuelto }. Si no matchea ningún alias exacto,
 *  intenta contención (la|nb.includes) como la web, y si nada, queda 'desconocido'. */
export function resolverObraCon(aliasMap, texto) {
  const alias = normObra(texto)
  if (!alias) return { obra_id: null, clasificacion: 'desconocido', alias, resuelto: false }
  const exacto = aliasMap.get(alias)
  if (exacto) return { ...exacto, alias, resuelto: true }
  // fallback tipo obraMatch de la web: contención por nombre (para grafías no vistas aún)
  const w = alias.split(' ')[0]
  for (const [k, v] of aliasMap) {
    if (alias.includes(k) || k.includes(alias) || (w.length > 3 && k.split(' ')[0] === w)) {
      return { ...v, alias, resuelto: true, aproximado: true }
    }
  }
  return { obra_id: null, clasificacion: 'desconocido', alias, resuelto: false }
}

/** Versión async que usa la DB (para el chat / capacidades). */
export async function resolverObra(texto) {
  return resolverObraCon(await cargarAliasMap(), texto)
}
