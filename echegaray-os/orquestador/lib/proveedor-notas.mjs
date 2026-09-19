// LAS NOTAS DEL DUEÑO SOBRE UN PROVEEDOR — A PRUEBA DE QUE LA LISTA CAMBIE.
//
// ═══ EL PEDIDO, TEXTUAL (31/07) ═══
//
// "recien puse pagado en compras y no borro el agrupar segun corresponde"
//
// Y el problema de fondo que eso destapa: cuando un proveedor se paga, sale de la lista de deuda. Sus
// notas vivían SÓLO en la columna Comentarios de esa lista, así que pagarle a alguien borraba lo que él
// había escrito sobre ese alguien. No es hipotético: la nota de FEMENIA desapareció de la pestaña
// cuando su deuda se fue a cero, y la de Hormiserv sobrevivió por casualidad en una fila huérfana.
//
// ═══ LA REGLA ═══
//
// Una nota vale por la ENTIDAD de la que habla, no por el renglón donde cayó ni por si hoy le debemos.
// Vive en public.proveedor_notas, indexada por el nombre normalizado. El generador la escribe en la
// pestaña en cada corrida; si el dueño la edita, la corrida siguiente lee su texto y ese gana.
//
// ═══ BORRAR TAMBIÉN ES SUYO ═══
//
// La regla de oro del archivo es que lo que el dueño borra a mano manda. Pero una celda vacía no
// siempre es un borrado: si el proveedor NO está en la lista de esta corrida, su celda está vacía
// porque no hay fila, no porque él la haya limpiado. Entonces:
//
//   · proveedor EN la lista + celda vacía + YO LA ESCRIBÍ la corrida anterior → la borró él. Se borra.
//   · proveedor EN la lista + celda vacía + NO la escribí antes → acaba de reaparecer. Se escribe.
//   · proveedor FUERA de la lista + celda vacía → no prueba nada. Se conserva.
//
// Sin esa distinción, la primera corrida después de pagarle a alguien le borraría la nota "porque
// estaba vacía" — el mismo defecto, disfrazado de respeto. Y sin el tercer dato (¿la escribí yo la vez
// pasada?) no se puede separar "la borró" de "todavía no la puse": son la misma celda vacía. Por eso
// la tabla guarda `escrita_en`.

/** La clave de negocio: el nombre sin tildes, en minúsculas, con los espacios colapsados. */
export const claveProv = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * NÚCLEO PURO: qué hacer con las notas, comparando la pestaña contra el respaldo.
 *
 * @param {Map<string,string>} enPestana  clave → texto que hay hoy en la pestaña (sólo con texto)
 * @param {Map<string,{proveedor:string,nota:string}>} enBase clave → lo guardado
 * @param {Set<string>} presentes claves de los proveedores que la lista SÍ muestra en esta corrida
 * @param {Set<string>} escritasAntes claves cuya nota el generador YA había escrito en la pestaña
 * @returns {{guardar:Array, borrar:string[], escribir:Map<string,string>}}
 */
export function conciliarNotas(enPestana = new Map(), enBase = new Map(), presentes = new Set(), escritasAntes = new Set()) {
  const guardar = []; const borrar = []; const escribir = new Map()
  // 1 · lo que está escrito en la pestaña manda: se guarda si es nuevo o cambió.
  for (const [clave, texto] of enPestana) {
    const t = String(texto ?? '').trim()
    if (!t) continue
    if (enBase.get(clave)?.nota !== t) guardar.push({ clave, nota: t })
  }
  // 2 · un borrado REAL: el proveedor está en la lista, su celda quedó vacía, había nota guardada, Y yo
  //     la había escrito en la corrida anterior. Sin esa última condición, un proveedor que reaparece
  //     —celda vacía porque todavía no la escribí— se leería como un borrado suyo.
  for (const [clave, v] of enBase) {
    if (!presentes.has(clave)) continue            // no está en la lista: la celda vacía no prueba nada
    if (!escritasAntes.has(clave)) continue        // nunca la puse: su ausencia no es un borrado
    const t = String(enPestana.get(clave) ?? '').trim()
    if (!t && v.nota) borrar.push(clave)
  }
  // 3 · lo que hay que escribir: el proveedor está en la lista y su celda está vacía, pero hay nota
  //     guardada y NO es un borrado (o sea: no entró en `borrar`).
  const borrados = new Set(borrar)
  for (const [clave, v] of enBase) {
    if (!presentes.has(clave) || borrados.has(clave)) continue
    if (!String(enPestana.get(clave) ?? '').trim() && v.nota) escribir.set(clave, v.nota)
  }
  return { guardar, borrar, escribir }
}

/** Lee el respaldo. Devuelve Map clave → {proveedor, nota}. */
export async function leerNotas(fileId, deps = {}) {
  const { query } = deps.query ? deps : await import('./db.mjs')
  const r = await query('select proveedor, clave, nota, escrita_en from public.proveedor_notas where file_id = $1', [fileId])
  return new Map(r.rows.map((x) => [x.clave, { proveedor: x.proveedor, nota: x.nota, escritaEn: x.escrita_en }]))
}

/** Guarda (upsert) las notas nuevas o cambiadas. */
export async function guardarNotas(fileId, notas = [], deps = {}) {
  if (!notas.length) return 0
  const { query } = deps.query ? deps : await import('./db.mjs')
  for (const n of notas) {
    await query(
      `insert into public.proveedor_notas (file_id, proveedor, clave, nota) values ($1,$2,$3,$4)
       on conflict (file_id, clave) do update set proveedor = excluded.proveedor, nota = excluded.nota, actualizado_en = now()`,
      [fileId, n.proveedor ?? n.clave, n.clave, n.nota])
  }
  return notas.length
}

/** Borra las notas que el dueño limpió a mano. */
export async function borrarNotas(fileId, claves = [], deps = {}) {
  if (!claves.length) return 0
  const { query } = deps.query ? deps : await import('./db.mjs')
  await query('delete from public.proveedor_notas where file_id = $1 and clave = any($2)', [fileId, claves])
  return claves.length
}

/** Marca las notas que el generador acaba de escribir en la pestaña (para distinguir un borrado real). */
export async function marcarEscritas(fileId, claves = [], deps = {}) {
  if (!claves.length) return 0
  const { query } = deps.query ? deps : await import('./db.mjs')
  await query('update public.proveedor_notas set escrita_en = now() where file_id = $1 and clave = any($2)', [fileId, claves])
  return claves.length
}

/** Las claves cuya nota el generador ya había escrito alguna vez en la pestaña. */
export const yaEscritas = (enBase = new Map()) =>
  new Set([...enBase.entries()].filter(([, v]) => v.escritaEn).map(([k]) => k))
