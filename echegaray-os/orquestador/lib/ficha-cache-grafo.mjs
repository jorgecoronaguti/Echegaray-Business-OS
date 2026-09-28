// EL GRAFO DE LA FICHA DEL CLIENTE CONTRA LA MIGRACIÓN QUE LA INVALIDA — funciones puras.
//
// Las usan `verificar-grafo-ficha-cache.mjs` (contra el catálogo vivo) y el test estático (contra
// una copia literal). Viven juntas para que «qué cuenta como cubierta» se defina una sola vez: si
// el script y el test leyeran la migración distinto, uno podría dar verde con el otro en rojo.

const MIGRACION_REL = 'supabase/migrations/20260928T2330_ficha_cache_invalidacion_por_trigger.sql'
export const RAICES = ['pantalla_cliente_en_vivo', 'hh_de_obra_en_vivo']
export { MIGRACION_REL }

const sinComentarios = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

/** `create or replace trigger trg_ficha_inv ... on public.<tabla>` de la migración, y cómo. */
export function triggersDe(texto) {
  const re = /create or replace trigger trg_ficha_inv\s[^;]*?\son public\.(\w+)\s+for each (row|statement) execute function public\.(\w+)\(([^)]*)\)/g
  return [...sinComentarios(texto).matchAll(re)].map(([, tabla, nivel, funcion, args]) => ({
    tabla, nivel, funcion, modo: args.split(',')[0]?.trim().replace(/'/g, ''),
  }))
}

/** Los identificadores entre acentos graves de la sección «cubierto sólo por el vencimiento». */
export function declaradasDe(texto) {
  const desde = texto.indexOf('═══ LO QUE QUEDA CUBIERTO SÓLO POR EL VENCIMIENTO')
  if (desde < 0) throw new Error('falta la sección de tablas declaradas en la cabecera')
  const hasta = texto.indexOf('═══', texto.indexOf('\n', desde))
  return new Set([...texto.slice(desde, hasta).matchAll(/`(\w+)`/g)].map((m) => m[1]))
}

// Una relación se LEE si va después de from/join/update/into/using o de una coma de un `from`
// implícito, con o sin paréntesis de por medio (`from (((analisis a` se perdía sin el `[\s(]+`).
// Por nombre suelto daba falsos positivos: `activo`, `carga_social`, `causa_desvio` y `compras`
// aparecen como columna, literal o comentario.
const RE_RELACION = /(?:\bfrom|\bjoin|\bupdate|\binto|\busing|,)[\s(]+(?:public\.)?"?([a-z_][a-z0-9_]*)/g
const RE_LLAMADA = /\b([a-z_][a-z0-9_]*)\s*\(/g

/** Aristas del cuerpo de una función: relaciones leídas y funciones llamadas. */
export function aristasDeTexto(src, relaciones, funciones) {
  const t = sinComentarios(src ?? '').toLowerCase()
  const out = new Set()
  for (const [, n] of t.matchAll(RE_RELACION)) if (relaciones.has(n)) out.add(`r:${n}`)
  for (const [, n] of t.matchAll(RE_LLAMADA)) if (funciones.has(n)) out.add(`f:${n}`)
  return out
}

/**
 * Recorre desde las raíces. `relaciones`: nombre → relkind; `funciones`: nombre → prosrc;
 * `dependencias`: 'r:vista' | 'f:funcion' → aristas exactas de pg_depend. Una tabla es hoja.
 */
export function recorrerGrafo({ relaciones, funciones, dependencias }, raices = RAICES) {
  const vistos = new Set()
  const tablas = new Set()
  const cola = raices.map((r) => `f:${r}`)
  while (cola.length) {
    const k = cola.shift()
    if (vistos.has(k)) continue
    vistos.add(k)
    const nombre = k.slice(2)
    if (k.startsWith('r:') && ['r', 'p'].includes(relaciones.get(nombre))) {
      tablas.add(nombre)
      continue
    }
    const siguientes = new Set(dependencias.get(k) ?? [])
    if (k.startsWith('f:')) for (const a of aristasDeTexto(funciones.get(nombre), relaciones, funciones)) siguientes.add(a)
    cola.push(...siguientes)
  }
  return { tablas, nodos: vistos.size - tablas.size }
}

/** Tablas del grafo que la migración no cubre con trigger ni declara. Vacío = verde. */
export function faltantes(tablas, texto) {
  const conTrigger = new Set(triggersDe(texto).map((t) => t.tabla))
  const declaradas = declaradasDe(texto)
  return [...tablas].filter((t) => !conTrigger.has(t) && !declaradas.has(t)).sort()
}
