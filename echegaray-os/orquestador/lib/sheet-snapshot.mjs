// SNAPSHOT / DESHACER de pestañas de Sheets — la red de seguridad antes de que el OS escriba.
//
// El OS edita planillas reales de la empresa. Hasta hoy no había marcha atrás: el 2026-07-19 una
// edición de la pestaña Caja frenó por tope de costo a mitad y la dejó medio reescrita, sin forma
// de volver. Escribir sin poder deshacer es un riesgo sobre el sistema de gestión de la empresa,
// no una funcionalidad incompleta.
//
// Se engancha en el ejecutor de tools (punto único por donde pasan las 30 escrituras de Drive), no
// tool por tool: así ninguna escritura futura nace sin red por olvido.

/** Nombre de la pestaña que una tool va a tocar, mirando sus argumentos. PURA.
 *  Acepta `pestana`/`tab`/`hoja` sueltos, o un rango A1 tipo "Caja!A1:D10". */
export function pestanaObjetivo(input = {}) {
  const directa = input.pestana ?? input.tab ?? input.hoja ?? input.nombre_pestana
  if (directa && String(directa).trim()) return String(directa).trim()
  for (const k of ['range', 'rango', 'ranges', 'rangos']) {
    const v = input[k]
    const uno = Array.isArray(v) ? v[0] : v
    const m = /^'?([^'!]+)'?!/.exec(String(uno || ''))
    if (m) return m[1].trim()
  }
  return null
}

/** Id del Sheet que una tool va a tocar. PURA. */
export function archivoObjetivo(input = {}, fileId) {
  return input.archivo_id ?? input.file_id ?? input.fileId ?? input.spreadsheet_id ?? fileId ?? null
}

// Tools de escritura que NO tocan el contenido de una pestaña (crear archivos, mover, renombrar…):
// snapshotearlas sería ruido y costo sin beneficio.
const SIN_SNAPSHOT = new Set([
  'drive_create', 'drive_copy', 'drive_move', 'drive_rename', 'drive_trash', 'drive_delete',
  'drive_add_tab', 'drive_delete_tab', 'drive_rename_tab', 'exportar_a_pdf',
  'crear_presentacion_google_slides', 'previsualizar_presentacion', 'ver_presentacion',
  'drive_write_doc', 'drive_doc_insert_image', 'drive_doc_insert_table', 'drive_doc_replace_text',
  'drive_doc_style_text', 'drive_freeze', 'drive_auto_resize',
  // La propia tool de deshacer NO se snapshotea desde el ejecutor: restaurarSnapshot ya guarda el
  // estado actual por su cuenta. Si el ejecutor también lo hiciera, el snapshot más reciente sería
  // el del estado ROTO y "volvé atrás" restauraría exactamente lo que se quería descartar — bug
  // real detectado en la prueba end-to-end del 2026-07-20: el undo no hacía nada.
  'deshacer_cambio_sheet',
])

// Snapshots que produce la maquinaria de deshacer. No son "un cambio del OS" que el dueño quiera
// revertir: son el respaldo del propio undo. Buscar "el último cambio" tiene que saltearlos.
export const TOOLS_DE_UNDO = ['deshacer_cambio_sheet', 'restaurar_pestana']

/** ¿Esta ejecución merece snapshot? PURA. */
export function mereceSnapshot(toolName, capability, input, fileId) {
  if (capability !== 'drive.write') return false
  if (SIN_SNAPSHOT.has(toolName)) return false
  return !!(archivoObjetivo(input, fileId) && pestanaObjetivo(input))
}

/**
 * Guarda el estado actual de la pestaña. Devuelve el id del snapshot o null si no se pudo.
 * NUNCA lanza: un fallo de snapshot no debe impedir el trabajo del dueño — se registra y sigue.
 */
export async function tomarSnapshot({ google, fileId, pestana, tool, directive, runId, logger }) {
  try {
    if (!google?.readSheetGrid) return null
    const { query } = await import('./db.mjs')
    const grid = await google.readSheetGrid(fileId, pestana)
    const filas = (grid.filas || []).map((f) => (f || []).map((c) => ({ f: c?.formula ?? null, v: c?.valor ?? null })))
    const { rows } = await query(
      `insert into orq.sheet_snapshots (file_id, pestana, grid, filas, columnas, tool, directive, run_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [fileId, pestana, JSON.stringify(filas), filas.length,
        filas.reduce((m, f) => Math.max(m, f.length), 0), tool ?? null,
        String(directive || '').slice(0, 500) || null, runId ?? null])
    return rows[0]?.id ?? null
  } catch (err) {
    logger?.warn?.('sheet-snapshot: no se pudo guardar el estado previo', { pestana, error: String(err?.message ?? err).slice(0, 160) })
    return null
  }
}

/** Último snapshot de una pestaña (o el más reciente de todos si no se especifica). */
export async function ultimoSnapshot({ fileId, pestana } = {}) {
  const { query } = await import('./db.mjs')
  const cond = []
  const args = []
  if (fileId) { args.push(fileId); cond.push(`file_id = $${args.length}`) }
  if (pestana) { args.push(pestana); cond.push(`pestana = $${args.length}`) }
  args.push(TOOLS_DE_UNDO)
  cond.push(`coalesce(tool,'') <> all($${args.length})`)
  const { rows } = await query(
    `select id, file_id, pestana, grid, filas, columnas, tool, directive, created_at
       from orq.sheet_snapshots
      where ${cond.join(' and ')}
      order by created_at desc limit 1`, args)
  return rows[0] ?? null
}

/** Celda → lo que hay que escribir: la FÓRMULA si la tenía, si no el valor literal. PURA. */
export function celdaARestaurar(c) {
  if (!c) return ''
  return c.f ?? (c.v ?? '')
}

/**
 * Restaura una pestaña al estado del snapshot. Antes de pisar nada toma OTRO snapshot del estado
 * actual: deshacer también tiene que poder deshacerse.
 */
export async function restaurarSnapshot({ google, snapshotId, logger }) {
  const { query } = await import('./db.mjs')
  const { rows } = await query(
    `select id, file_id, pestana, grid, filas, columnas from orq.sheet_snapshots where id = $1`, [snapshotId])
  const snap = rows[0]
  if (!snap) return { error: 'no encontré ese snapshot' }
  if (!google?.updateSheetValues) return { error: 'no hay cuenta de Google autorizada para escribir' }
  // Deshacer también se deshace.
  await tomarSnapshot({ google, fileId: snap.file_id, pestana: snap.pestana, tool: 'restaurar_pestana', logger })
  const grid = Array.isArray(snap.grid) ? snap.grid : JSON.parse(snap.grid)
  const valores = grid.map((f) => (f || []).map(celdaARestaurar))
  // updateSheetValues usa USER_ENTERED y localiza las fórmulas a es-AR, igual que si se tipearan.
  await google.updateSheetValues(snap.file_id, `${snap.pestana}!A1`, valores)
  await query('update orq.sheet_snapshots set restaurado_en = now() where id = $1', [snap.id])
  return { restaurado: true, pestana: snap.pestana, filas: valores.length, snapshot_id: snap.id }
}
