// Tools de Drive/Sheets tipadas como CAPACIDAD. Cada tool declara su `capability`
// (la que gobierna la policy) y su `account` (qué cuenta Google toca). El schema es
// la definición que ve el modelo (Anthropic tools). `run` recibe el input del modelo
// y el cliente Google inyectado. READ-ONLY en esta fase (solo drive.read).
//
// Las tools de escritura (drive.write/mail.send) NO ejecutan acá: el ejecutor las
// encola en pending_operations (requires_approval). Sus definiciones se agregan
// cuando exista la pantalla de aprobación (Fase 5).

const FOLDER = 'application/vnd.google-apps.folder'
const tipoLegible = (m) =>
  m === FOLDER ? 'carpeta' : m.includes('spreadsheet') || m.includes('excel') ? 'planilla' : m.includes('document') || m.includes('word') ? 'documento' : m.includes('pdf') ? 'pdf' : m.includes('image') ? 'imagen' : 'archivo'

/** Devuelve el registry de tools de lectura, cerrado sobre un cliente Google. */
export function driveReadTools(google) {
  return {
    'drive.list': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_list',
        description:
          'Lista el contenido de una carpeta de Drive (archivos y subcarpetas, con tipo y fecha). Usalo para VER qué hay en una carpeta antes de proponer un orden o detectar qué falta — ej. listar la carpeta "administracion", "PRESUPUESTOS" o los legajos de personal. Pasá folder_id si lo tenés, o query con el nombre de la carpeta.',
        input_schema: {
          type: 'object',
          properties: {
            folder_id: { type: 'string', description: 'ID de la carpeta (preferido)' },
            query: { type: 'string', description: 'nombre de la carpeta si no tenés id, ej. "administracion"' },
          },
        },
      },
      async run(input) {
        let folderId = input?.folder_id
        if (!folderId && input?.query) {
          const f = await google.findFolder(input.query)
          if (!f) return { error: `no encontré una carpeta llamada "${input.query}"` }
          folderId = f.id
        }
        if (!folderId) return { error: 'falta folder_id o query' }
        const items = await google.listFolder(folderId)
        return {
          folder_id: folderId,
          count: items.length,
          items: items.map((i) => ({ name: i.name, tipo: tipoLegible(i.mimeType), id: i.id, modificado: i.modifiedTime ?? null })),
        }
      },
    },
    'drive.tabs': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_tabs',
        description:
          'Lista las PESTAÑAS (hojas) de un Google Sheet. Usalo ANTES de leer o escribir para descubrir en qué pestaña está lo que buscás (ej. "Compras", "Caja", "Sueldos" son pestañas del mismo archivo, no archivos distintos). Después leé/escribí con el rango de esa pestaña, ej. "Compras!A1:F".',
        input_schema: { type: 'object', properties: { file_id: { type: 'string', description: 'ID del Sheet' } }, required: ['file_id'] },
      },
      async run(input) {
        if (!input?.file_id) return { error: 'falta file_id' }
        const tabs = await google.listTabs(input.file_id)
        return { file_id: input.file_id, tabs }
      },
    },
    'drive.lastrow': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_last_row',
        description:
          'Devuelve el número de la ÚLTIMA fila con datos de una pestaña (mirando una columna de referencia, por defecto "A"). Usalo para saber en qué fila escribir el próximo registro (next_empty_row) SIN leer toda la planilla ni insertar/desplazar filas: después escribís con drive_update en esa fila.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            tab: { type: 'string', description: 'nombre de la pestaña, ej. "Compras"' },
            column: { type: 'string', description: 'columna de referencia (siempre poblada en filas con datos), default "A"' },
          },
          required: ['file_id', 'tab'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id y tab' }
        const col = String(input.column || 'A').toUpperCase()
        const vals = await google.readSheetValues(input.file_id, `${input.tab}!${col}1:${col}20000`)
        let last = 0
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] && vals[i][0] != null && String(vals[i][0]).trim() !== '') last = i + 1
        }
        return { file_id: input.file_id, tab: input.tab, column: col, last_data_row: last, next_empty_row: last + 1 }
      },
    },
    'drive.read': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_read',
        description:
          'Lee un Google Sheet de Drive y devuelve las celdas de un rango. Usá esto para consultar datos reales de la empresa (caja, P&L, presupuestos) en vez de decir "desconocido". Pasá file_id si lo tenés, o query con el nombre del archivo.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del archivo de Drive (preferido si lo conocés)' },
            query: { type: 'string', description: 'nombre del archivo si no tenés file_id, ej. "Flujo de Caja - Cash Flow"' },
            range: { type: 'string', description: 'rango A1 para Google Sheets nativos, ej. "RESUMEN!A1:F60". Por defecto A1:F60.' },
            sheet: { type: 'string', description: 'nombre de la pestaña a leer (para Excel .xlsx). Por defecto la primera.' },
            max_rows: { type: 'number', description: 'máximo de filas a devolver de un Excel (default 50).' },
          },
        },
      },
      async run(input) {
        let fileId = input?.file_id
        if (!fileId && input?.query) {
          const files = await google.searchFile(input.query)
          if (!files.length) return { error: `no encontré ningún archivo llamado "${input.query}"` }
          fileId = files[0].id
        }
        if (!fileId) return { error: 'falta file_id o query' }
        const meta = await google.getMeta(fileId)
        const mt = meta.mimeType || ''
        // Excel .xlsx/.xlsm (subido, no nativo): descargar + parsear.
        if (mt.includes('spreadsheetml') || mt.includes('ms-excel')) {
          const x = await google.readExcel(fileId, { sheet: input?.sheet, maxRows: input?.max_rows || 50 })
          return { file_id: fileId, name: meta.name, tipo: 'excel', ...x }
        }
        // Google Sheet nativo: leer rango por la Sheets API.
        if (mt.includes('google-apps.spreadsheet')) {
          const range = input?.range || 'A1:F60'
          const values = await google.readSheetValues(fileId, range)
          return { file_id: fileId, name: meta.name, tipo: 'google_sheet', range, rows: values.length, values }
        }
        // PDF/Word/imagen: aún no legibles por contenido — se informa honestamente.
        return { file_id: fileId, name: meta.name, tipo: mt, nota: 'Este archivo no es una planilla (PDF/Word/imagen): el OS sabe que existe pero todavía no lee su contenido.' }
      },
    },
  }
}
