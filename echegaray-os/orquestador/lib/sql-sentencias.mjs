// PARTE UN ARCHIVO SQL EN SENTENCIAS, RESPETANDO LO QUE UN `split(';')` ROMPE.
//
// Existe para `reconstruir-desde-cero.mjs --sin-datos`: sobre una base de desarrollo sin los datos de
// producción, una migración que mezcla DDL con `insert … values (<ids reales>)` falla entera por una clave
// foránea y la transacción deshace también el esquema. Para poder aplicar el esquema y omitir SÓLO la
// sentencia de datos hace falta ejecutar sentencia por sentencia, y para eso hay que saber dónde termina
// cada una: no en cualquier `;` — hay `;` adentro de `$$ … $$`, de comillas simples y de comentarios.
//
// Puro. Sin I/O. Con test.

/** @param {string} sql @returns {string[]} sentencias sin el `;` final, sin vacías */
export function partirSentencias(sql) {
  const out = []
  let i = 0, inicio = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i], sig = sql[i + 1]
    if (ch === '-' && sig === '-') { const fin = sql.indexOf('\n', i); i = fin < 0 ? n : fin + 1; continue }
    if (ch === '/' && sig === '*') { const fin = sql.indexOf('*/', i + 2); i = fin < 0 ? n : fin + 2; continue }
    if (ch === "'") { i++; while (i < n) { if (sql[i] === "'") { if (sql[i + 1] === "'") { i += 2; continue } i++; break } i++ } continue }
    if (ch === '"') { i++; while (i < n && sql[i] !== '"') i++; i++; continue }
    if (ch === '$') {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i, i + 64))
      if (m) { const tag = m[0]; const fin = sql.indexOf(tag, i + tag.length); i = fin < 0 ? n : fin + tag.length; continue }
    }
    if (ch === ';') { const s = sinComentariosIniciales(sql.slice(inicio, i)); if (s) out.push(s); inicio = i + 1 }
    i++
  }
  const resto = sinComentariosIniciales(sql.slice(inicio))
  if (resto) out.push(resto)
  return out
}

const sinComentariosIniciales = (s) => s.replace(/^(\s*(--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/))*\s*/, '').trim()

/** ¿Es un error de DATOS (no de esquema)? Clase 23 = integridad (FK, único, not null), clase 22 =
 *  datos (división por cero, cast), P0001 = `raise exception` propio. Todo lo demás —columna que no
 *  existe, tipo que no cierra, permiso— es de esquema y corta la cadena. */
export function esErrorDeDatos(code) {
  const c = String(code ?? '')
  return c.startsWith('23') || c.startsWith('22') || c === 'P0001'
}

/** Sólo dentro de bloques `do $tag$ … $tag$`: `raise exception` → `raise warning`. Las funciones que la
 *  migración crea no se tocan. */
export function degradarAfirmacionesDeDatos(sql) {
  return sql.replace(/\bdo\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1/gi,
    (_m, tag, cuerpo) => `do ${tag}${cuerpo.replace(/raise\s+exception/gi, 'raise warning')}${tag}`)
}
