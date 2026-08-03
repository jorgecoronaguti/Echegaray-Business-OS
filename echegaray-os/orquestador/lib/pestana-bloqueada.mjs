// EL CANDADO DE PESTAÑA — "esta pestaña es mía; adaptá el resto, no la toques".
//
// POR QUÉ (24/07). El dueño, harto: "sigue sin respetar mis modificaciones en el sheet… no tolero
// más que me borre lo que hago", y el objetivo real: "que todo el sheet y sus agentes trabajen de
// manera autónoma y automática PERO que respeten mis reglas".
//
// La preservación que ya existe ([[preservar-anotaciones]], [[respetar-ediciones]]) es de nivel
// CELDA/RÓTULO: protege un texto cambiado, una columna o nota agregada. No alcanza cuando el dueño
// REESCRIBE una pestaña entera —otro orden, otras secciones, bloques eliminados— porque el generador
// dueño de esa pestaña la regenera cada 2h e reimpone su diseño. Su regla es de nivel PESTAÑA:
// "texto, estructura, nombres, orden, eliminaciones, criterios o diseño = definitivo".
//
// El candado es el único mecanismo a la altura de esa regla y del pedido de autonomía a la vez:
//
//   · las pestañas que el dueño NO tomó siguen actualizándose solas, como siempre;
//   · las que tomó quedan INTACTAS — ningún agente las escribe;
//   · y si la pestaña del dueño usa fórmulas, esas fórmulas siguen recalculando solas por el motor de
//     Sheets. Autónomo Y respetado: no hay que elegir.
//
// Es la fuente única del candado. La consultan el runner del timer (saltea el generador), el portón
// de escritura `escribirPreservando` (se niega a escribir) y los escritores por rango sueltos.

/** Asegura la tabla del candado. Idempotente; misma forma que la migración. */
async function asegurarTabla(query) {
  await query(`
    create table if not exists public.sheet_pestanas_bloqueadas (
      file_id      text        not null,
      pestana      text        not null,
      motivo       text,
      bloqueada_por text,
      bloqueada_en timestamptz not null default now(),
      primary key (file_id, pestana)
    )`)
}

/** El query real por defecto; se puede inyectar para tests (nunca tocan la base). */
async function q(deps) {
  if (deps?.query) return deps.query
  return (await import('./db.mjs')).query
}

/**
 * NÚCLEO PURO: ¿todas las pestañas que este paso escribe están bloqueadas? Un paso se saltea sólo si
 * TODO lo que produce es del dueño; si escribe una pestaña libre, corre (y el portón de escritura
 * protege, celda a celda, cualquier pestaña bloqueada que igual toque).
 *
 * Un paso que no declara pestañas (un sincronizador de una columna, un auditor) nunca se saltea: no
 * "posee" una pestaña, así que el candado no aplica — lo suyo lo filtra el portón, no el runner.
 *
 * @param {string[]} pestanasDelPaso las pestañas que el paso declara escribir
 * @param {Set<string>} bloqueadas nombres de pestañas bloqueadas
 * @returns {boolean}
 */
export function pasoTotalmenteBloqueado(pestanasDelPaso = [], bloqueadas = new Set()) {
  if (!pestanasDelPaso.length) return false
  return pestanasDelPaso.every((p) => bloqueadas.has(p))
}

/** NÚCLEO PURO: de una lista de pestañas, cuáles están bloqueadas (para escritores multi-pestaña). */
export function filtrarBloqueadas(pestanas = [], bloqueadas = new Set()) {
  return { libres: pestanas.filter((p) => !bloqueadas.has(p)), bloqueadas: pestanas.filter((p) => bloqueadas.has(p)) }
}

/** El conjunto de pestañas bloqueadas de un archivo. Una sola lectura para todo el runner. */
export async function pestanasBloqueadas(deps, fileId) {
  try {
    const query = await q(deps)
    await asegurarTabla(query)
    const { rows } = await query('select pestana from public.sheet_pestanas_bloqueadas where file_id = $1', [fileId])
    return new Set(rows.map((r) => r.pestana))
  } catch { return new Set() } // sin base, el candado no puede consultarse: no se rompe la corrida, se sigue sin candado
}

/** ¿Está bloqueada esta pestaña puntual? Para el portón de escritura. */
export async function estaBloqueada(deps, fileId, pestana) {
  const set = await pestanasBloqueadas(deps, fileId)
  return set.has(String(pestana))
}

/**
 * ¿Está bloqueada, y QUIÉN la bloqueó? La distinción importa porque los dos candados no valen lo mismo:
 * `dueño` es su voluntad declarada sobre la pestaña ("es mía, no la toques"), mientras que `auto` lo puso
 * el OS solo al detectar por firma que la pestaña cambió. Quien necesite tratar distinto una deducción
 * propia de una decisión del dueño —hoy, la excepción `soloFilasVacias` de guarda-escritura.mjs— necesita
 * este dato; `estaBloqueada` no lo trae.
 *
 * Un candado sin autor registrado (fila vieja, `bloqueada_por` NULL) se lee como del DUEÑO: ante la duda,
 * el candado más fuerte. Sin base no se puede consultar → {bloqueada:false}, igual que `estaBloqueada`
 * (el fail-closed por base caída vive en el portón, que lo decide una sola vez para todas las pestañas).
 *
 * @returns {Promise<{bloqueada:boolean, por:string|null}>}
 */
export async function bloqueoDe(deps, fileId, pestana) {
  try {
    const query = await q(deps)
    await asegurarTabla(query)
    const { rows } = await query(
      'select bloqueada_por from public.sheet_pestanas_bloqueadas where file_id = $1 and pestana = $2',
      [fileId, String(pestana)])
    if (!rows.length) return { bloqueada: false, por: null }
    return { bloqueada: true, por: rows[0].bloqueada_por ?? 'dueño' }
  } catch { return { bloqueada: false, por: null } }
}

/** El dueño toma una pestaña: desde ahora ningún agente la escribe. Trazable (motivo/quién). */
export async function bloquear(deps, fileId, pestana, { motivo = null, por = 'dueño' } = {}) {
  const query = await q(deps)
  await asegurarTabla(query)
  await query(
    `insert into public.sheet_pestanas_bloqueadas (file_id, pestana, motivo, bloqueada_por) values ($1,$2,$3,$4)
     on conflict (file_id, pestana) do update set motivo = excluded.motivo, bloqueada_por = excluded.bloqueada_por, bloqueada_en = now()`,
    [fileId, String(pestana), motivo, por],
  )
  return { ok: true }
}

/** El dueño devuelve una pestaña al OS: vuelve a mantenerse sola. */
export async function desbloquear(deps, fileId, pestana) {
  const query = await q(deps)
  await asegurarTabla(query)
  await query('delete from public.sheet_pestanas_bloqueadas where file_id = $1 and pestana = $2', [fileId, String(pestana)])
  return { ok: true }
}

/** Lista las pestañas bloqueadas de un archivo, con su motivo y fecha. */
export async function listar(deps, fileId) {
  const query = await q(deps)
  await asegurarTabla(query)
  const { rows } = await query(
    'select pestana, motivo, bloqueada_por, bloqueada_en from public.sheet_pestanas_bloqueadas where file_id = $1 order by pestana', [fileId])
  return rows
}
