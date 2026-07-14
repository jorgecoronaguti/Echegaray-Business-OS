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
          'Lee el CONTENIDO de un archivo de Drive: Google Sheets (celdas de un rango), Excel (.xlsx/.xlsm) y también PDFs (contratos, cotizaciones, remitos, planos con texto — devuelve el texto extraído). Usá esto para consultar datos reales de la empresa en vez de decir "desconocido". Pasá file_id si lo tenés, o query con el nombre. Para PDFs no hace falta rango.',
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
        // PDF: extraer el TEXTO localmente (0 API). Cubre contratos, cotizaciones,
        // remitos, planos con texto. Un PDF escaneado (imagen) devuelve poco texto.
        if (mt.includes('pdf')) {
          const p = await google.readPdfText(fileId)
          if (p.scanned) return { file_id: fileId, name: meta.name, tipo: 'pdf', pages: p.pages, nota: 'PDF sin texto extraíble (probablemente escaneado/imagen). Para leerlo haría falta OCR/visión.' }
          return { file_id: fileId, name: meta.name, tipo: 'pdf', pages: p.pages, chars: p.chars, truncado: p.truncated, texto: p.text }
        }
        // Word/imagen: aún no legibles por contenido — se informa honestamente.
        return { file_id: fileId, name: meta.name, tipo: mt, nota: 'Este archivo no es una planilla ni PDF (Word/imagen): el OS sabe que existe pero todavía no lee su contenido.' }
      },
    },
    'drive.obras': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'list_obras',
        description:
          'Lista las OBRAS/clientes de la empresa (las subcarpetas de PRESUPUESTOS, cada una es un cliente/obra con sus Cotizaciones y Planos adentro). Usalo cuando el dueño dice "mis obras", "qué obras tengo", o quiere el estado de una obra: te da el nombre y el folder_id de cada una para después entrar con drive_list/drive_read a su presupuesto, avance o adicionales.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        const f = await google.findFolder('PRESUPUESTOS')
        if (!f) return { error: 'no encontré la carpeta PRESUPUESTOS en el Drive' }
        const items = await google.listFolder(f.id)
        const obras = items.filter((i) => (i.mimeType || '').includes('folder')).map((i) => ({ obra: i.name, folder_id: i.id }))
        return { fuente: 'PRESUPUESTOS', count: obras.length, obras }
      },
    },
    'drive.navigate': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'navigate_to',
        description:
          'ABRE en el navegador del dueño un archivo o CARPETA de Drive: úsalo cuando pida "llevame a", "abrí", "andá a", "mostrame la carpeta", "dónde está X". Resuelve el nombre a su ubicación real y devuelve el destino para abrirlo en su pestaña. Pasá query (nombre del archivo/carpeta) o file_id si ya lo tenés. Es lo que permite MOVERSE entre carpetas del Drive y llegar directo a lo buscado.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'nombre del archivo o carpeta a abrir, ej. "administracion", "Flujo de Caja", "PRESUPUESTOS 2026"' },
            file_id: { type: 'string', description: 'ID si ya lo conocés (preferido)' },
          },
        },
      },
      async run(input) {
        let fileId = input?.file_id
        if (!fileId && input?.query) {
          // Buscar como archivo Y como carpeta; priorizar coincidencia de carpeta si el
          // pedido suena a carpeta, si no el primer archivo.
          const folder = await google.findFolder(input.query)
          const files = await google.searchFile(input.query)
          fileId = folder?.id || files[0]?.id
          if (!fileId) return { error: `no encontré ningún archivo ni carpeta llamado "${input.query}"` }
        }
        if (!fileId) return { error: 'falta query o file_id' }
        const meta = await google.getMeta(fileId)
        const url = meta.webViewLink
          || (meta.mimeType?.includes('folder') ? `https://drive.google.com/drive/folders/${fileId}` : `https://drive.google.com/file/d/${fileId}/view`)
        return { ok: true, name: meta.name, tipo: tipoLegible(meta.mimeType), navigate: { url, name: meta.name, file_id: fileId } }
      },
    },
  }
}
