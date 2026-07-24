// REGISTRAR QUE EL OS LEYÓ UNA FUENTE — cerrar el trinquete de la frescura desde el otro lado.
//
// ═══ POR QUÉ EXISTE (23/07) ═══
//
// La alerta de frescura dejó de ser un trinquete de una sola vía (ver la migración
// 20260723210000_frescura_bidireccional): `recalcular_frescura_fuentes()` ya devuelve una fuente a
// 'actualizado' cuando su `ultima_sincronizacion_exitosa` vuelve a entrar en ventana. Pero eso sólo
// sirve si ALGUIEN escribe esa fecha, y NADIE lo hacía: el OS lee el Cash Flow, el avance y las
// compras todo el tiempo y jamás registraba la lectura. Resultado: "Flujo de Caja - Cash Flow
// (Sheet)" figuraba atrasado (sync 06/07) cuando el pipeline lo reconstruye entero cada día.
//
// Esta capacidad es la contraparte honesta: cuando un ingester del OS TERMINA de leer una fuente con
// éxito, la marca. No estima, no inventa: registra un hecho —"lo leí recién y salió bien"— y deja
// que `recalcular_frescura_fuentes()` decida el estado (una capacidad, una fuente de verdad del
// estado). No toca 'error' ni 'fuente_no_disponible' ni juicios humanos: sólo mueve la fecha.

/**
 * NÚCLEO PURO (sin DB): decide a qué fila de fuentes_datos le corresponde un registro de lectura.
 *
 * Es deliberadamente estricto: si el identificador no matchea EXACTAMENTE una fila, no elige ninguna.
 * Marcar la fuente equivocada como fresca es peor que no marcar nada — escondería un atraso real.
 *
 * @param {Array<{id:any, nombre?:string, drive_file_id?:string}>} fuentes
 * @param {{driveFileId?:string, nombre?:string}} ident
 * @returns {{ok:true, id:any, nombre:string} | {ok:false, motivo:string}}
 */
export function elegirFuente(fuentes = [], { driveFileId, nombre } = {}) {
  if (!driveFileId && !nombre) return { ok: false, motivo: 'no se pasó ni driveFileId ni nombre' }
  const match = fuentes.filter((f) =>
    (driveFileId && f.drive_file_id === driveFileId) ||
    (nombre && String(f.nombre).trim() === String(nombre).trim()))
  if (match.length === 0) return { ok: false, motivo: `ninguna fuente coincide con ${driveFileId ? `drive_file_id=${driveFileId}` : `nombre="${nombre}"`}` }
  if (match.length > 1) return { ok: false, motivo: `${match.length} fuentes coinciden — el identificador es ambiguo, no se marca ninguna` }
  return { ok: true, id: match[0].id, nombre: match[0].nombre }
}

/**
 * Registra una lectura exitosa del OS sobre una fuente y recalcula su frescura.
 *
 * NO falla el proceso que la llama si la fuente no está registrada: un sync no debe romperse porque
 * su fila en fuentes_datos falte o el nombre no matchee. Devuelve el resultado para que el que llama
 * lo informe, y nunca tira.
 *
 * @param {object} deps  {query} — inyectable para test; por defecto usa lib/db.mjs
 * @param {{driveFileId?:string, nombre?:string, coberturaHasta?:string|Date|null}} opts
 *        `coberturaHasta` sólo se escribe si se pasa explícito: NUNCA se inventa hasta dónde llega el
 *        dato. Si no se sabe, no se toca (queda como estaba).
 * @returns {Promise<{ok:boolean, nombre?:string, estado?:string, motivo?:string}>}
 */
export async function registrarSincronizacion(deps = {}, opts = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  const { driveFileId, nombre, coberturaHasta } = opts
  try {
    const { rows } = await query('select id, nombre, drive_file_id from public.fuentes_datos')
    const sel = elegirFuente(rows, { driveFileId, nombre })
    if (!sel.ok) return { ok: false, motivo: sel.motivo }

    // Sólo se mueve la fecha (y la cobertura si se declara). El estado lo decide recalcular.
    if (coberturaHasta !== undefined) {
      await query(
        `update public.fuentes_datos
            set ultima_sincronizacion_exitosa = now(), ultima_lectura = now(),
                cobertura_hasta = $2, updated_at = now()
          where id = $1`,
        [sel.id, coberturaHasta])
    } else {
      await query(
        `update public.fuentes_datos
            set ultima_sincronizacion_exitosa = now(), ultima_lectura = now(), updated_at = now()
          where id = $1`,
        [sel.id])
    }
    await query('select public.recalcular_frescura_fuentes()')
    const { rows: [f] } = await query('select estado from public.fuentes_datos where id = $1', [sel.id])
    return { ok: true, nombre: sel.nombre, estado: f?.estado ?? null }
  } catch (e) {
    return { ok: false, motivo: String(e?.message ?? e).slice(0, 160) }
  }
}
