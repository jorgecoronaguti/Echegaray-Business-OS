// Tools de Drive/Sheets tipadas como CAPACIDAD. Cada tool declara su `capability`
// (la que gobierna la policy) y su `account` (qué cuenta Google toca). El schema es
// la definición que ve el modelo (Anthropic tools). `run` recibe el input del modelo
// y el cliente Google inyectado. READ-ONLY en esta fase (solo drive.read).
//
// Las tools de escritura (drive.write/mail.send) NO ejecutan acá: el ejecutor las
// encola en pending_operations (requires_approval). Sus definiciones se agregan
// cuando exista la pantalla de aprobación (Fase 5).

import { mapearFormulas, formatFormulas } from '../sheet-formulas.mjs'
import { crearCapacidadDrive } from '../drive/index.mjs'
import { caraFina } from './drive-cara.mjs'


/**
 * Devuelve el registry de tools de lectura, cerrado sobre un cliente Google.
 *
 * Desde el 31/08 estas tools NO implementan nada: son la cara fina de la capacidad nativa
 * (`lib/drive/`), que es llamable como función sin ningún modelo de por medio. `opciones` es
 * aditivo (db/índice/actor) para no romperles la firma a `os.mjs`, `interactive-server.mjs`,
 * `handlers/specialist.mjs` ni `handlers/operation_execute.mjs`.
 */
export function driveReadTools(google, opciones = {}) {
  const drive = crearCapacidadDrive({ google, ...opciones })
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
      run: caraFina(async (input) => {
        let folderId = input?.folder_id
        if (!folderId && input?.query) {
          const encontradas = await drive.buscarCarpetas(input.query)
          if (!encontradas.length) return { error: `no encontré una carpeta llamada "${input.query}"` }
          folderId = encontradas[0].file_id
        }
        if (!folderId) return { error: 'falta folder_id o query' }
        // La capacidad pagina (antes se truncaba en silencio pasadas mil filas) y levanta TRASHED
        // si la carpeta está en la papelera, en vez de devolver una lista vacía sin motivo.
        const r = await drive.listarCarpeta(folderId)
        return {
          folder_id: folderId,
          carpeta: r.carpeta.name,
          count: r.count,
          truncado: r.truncado,
          items: r.items.map((i) => ({ name: i.name, tipo: i.tipo, id: i.file_id, modificado: i.modified_at })),
        }
      }),
    },
    'drive.tabs': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_tabs',
        description:
          'Lista las PESTAÑAS (hojas) de un Google Sheet con su gid (el número del final de la URL que manda el dueño: .../edit#gid=123 → esa pestaña). Usalo ANTES de leer o escribir para descubrir en qué pestaña está lo que buscás (ej. "Compras", "Caja", "Sueldos" son pestañas del mismo archivo, no archivos distintos). Después leé/escribí con el rango de esa pestaña, ej. "Compras!A1:F".',
        input_schema: { type: 'object', properties: { file_id: { type: 'string', description: 'ID del Sheet' } }, required: ['file_id'] },
      },
      async run(input) {
        if (!input?.file_id) return { error: 'falta file_id' }
        const meta = await google.getSheetMeta(input.file_id).catch(() => null)
        if (meta?.length) return { file_id: input.file_id, tabs: meta.map((m) => m.title), pestanas: meta.map((m) => ({ titulo: m.title, gid: m.sheetId, filas: m.rows, columnas: m.cols })) }
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
            formulas: { type: 'boolean', description: 'true = devuelve la FÓRMULA de cada celda además del valor. USALO SIEMPRE que veas un #REF!, #ERROR!, #N/A, #¡VALOR! o un número que no cierra: sin la fórmula no se puede saber qué se rompió, sólo adivinar. También sirve para verificar que una celda es fórmula y no un número pegado a mano.' },
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
          // Con `formulas` se lee la pestaña COMO ES (fórmula + valor), que es lo único que permite
          // diagnosticar un #REF! en vez de opinar sobre él.
          if (input?.formulas) {
            const grid = await google.readSheetGrid(fileId, range)
            const m = mapearFormulas(grid)
            return { file_id: fileId, name: meta.name, tipo: 'google_sheet', range, ...m, resumen: formatFormulas(m, range) }
          }
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
        // Google Doc nativo: exportar a texto plano (contratos, informes, notas).
        if (mt.includes('google-apps.document')) {
          const d = await google.readDocText(fileId)
          return { file_id: fileId, name: meta.name, tipo: 'google_doc', chars: d.chars, truncado: d.truncated, texto: d.text }
        }
        // Word .docx (subido, no nativo): Google lo puede exportar a texto vía Drive export.
        if (mt.includes('wordprocessingml') || mt.includes('msword')) {
          try { const d = await google.readDocText(fileId); return { file_id: fileId, name: meta.name, tipo: 'word', chars: d.chars, truncado: d.truncated, texto: d.text } }
          catch { /* si no exporta, cae al aviso honesto */ }
        }
        // Imagen u otro: aún no legible por contenido — se informa honestamente.
        return { file_id: fileId, name: meta.name, tipo: mt, nota: 'Este archivo no es planilla, PDF ni documento de texto (probablemente imagen): el OS sabe que existe pero todavía no lee su contenido.' }
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
      run: caraFina(async () => {
        const carpetas = await drive.buscarCarpetas('PRESUPUESTOS')
        if (!carpetas.length) return { error: 'no encontré la carpeta PRESUPUESTOS en el Drive' }
        const r = await drive.listarCarpeta(carpetas[0].file_id)
        const obras = r.items.filter((i) => i.is_folder).map((i) => ({ obra: i.name, folder_id: i.file_id }))
        return { fuente: r.carpeta.name, count: obras.length, obras }
      }),
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
      run: caraFina(async (input) => {
        let fileId = input?.file_id
        if (!fileId && input?.query) {
          // Buscar como carpeta Y como archivo; priorizar la carpeta si existe con ese nombre.
          const carpetas = await drive.buscarCarpetas(input.query).catch(() => [])
          const archivos = carpetas.length ? [] : await drive.buscarPorNombre(input.query)
          fileId = carpetas[0]?.file_id || archivos[0]?.file_id
          if (!fileId) return { error: `no encontré ningún archivo ni carpeta llamado "${input.query}"` }
        }
        if (!fileId) return { error: 'falta query o file_id' }
        const ref = await drive.referencia(fileId)
        return { ok: true, name: ref.name, tipo: ref.tipo, trashed: ref.trashed, navigate: { url: ref.web_view_link, name: ref.name, file_id: ref.file_id } }
      }),
    },
  }
}
