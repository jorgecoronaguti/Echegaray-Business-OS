// Tools de ESCRITURA de Drive/Sheets, tipadas como CAPACIDAD. Espejo de drive.mjs
// (lectura) para el lado de escritura. Declaran capability 'drive.write' (Nivel E →
// la policy devuelve requires_approval) o 'drive.delete' (Nivel F → forbidden).
//
// CLAVE del diseño: estas tools NUNCA se ejecutan desde el motor interactivo. Cuando
// el modelo las invoca, el tool-executor consulta la policy, ve requires_approval y
// las ENCOLA en pending_operations (no llama a run). El único que llama a run() es el
// ejecutor de operaciones aprobadas (handlers/operation_execute.mjs), DESPUÉS de que
// un humano aprobó. Por eso el efecto real vive acá, en un solo lugar, reusado.

const DOC = 'application/vnd.google-apps.document'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const SLIDES = 'application/vnd.google-apps.presentation'
const FOLDER = 'application/vnd.google-apps.folder'
const TIPO_MIME = { doc: DOC, documento: DOC, sheet: SHEET, planilla: SHEET, slides: SLIDES, presentacion: SLIDES, presentación: SLIDES, carpeta: FOLDER, folder: FOLDER }

/** Valida que `values` sea una matriz de filas (array de arrays de celdas). */
function normalizeValues(values) {
  if (!Array.isArray(values)) return null
  if (values.length && !Array.isArray(values[0])) return values.map((v) => [v]) // una columna
  return values
}

/** Reduce un rango A1 a su CELDA DE INICIO ("Hoja!D22:G22" → "Hoja!D22"). Sheets dimensiona
 *  la escritura según la matriz de values, así que dando solo la celda inicial NO puede haber
 *  el error "tried writing to column/row X" cuando el modelo se equivoca en el fin del rango
 *  (causa real de loops de tool-use hasta agotar iteraciones). */
function startCell(range) {
  if (!range || typeof range !== 'string') return range
  const bang = range.lastIndexOf('!')
  const sheet = bang >= 0 ? range.slice(0, bang + 1) : ''
  const a1 = bang >= 0 ? range.slice(bang + 1) : range
  const start = a1.split(':')[0].trim()
  return start ? sheet + start : range
}

/** Registry de tools de escritura, cerrado sobre un cliente Google con WRITE_SCOPES. */
export function driveWriteTools(google) {
  return {
    'drive.update': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_update',
        description:
          'Sobrescribe un rango de celdas de un Google Sheet EXISTENTE con valores nuevos. Usalo para corregir/completar/ordenar celdas concretas. Pasá file_id, range (A1, ej. "RESUMEN!B4:B6") y values (matriz de filas). REQUIERE aprobación humana: no se ejecuta hasta que el dueño la apruebe.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del Sheet destino' },
            range: { type: 'string', description: 'rango A1 a sobrescribir, ej. "Compras!A2:D2"' },
            values: { type: 'array', description: 'matriz de filas (array de arrays de celdas)', items: { type: 'array' } },
          },
          required: ['file_id', 'range', 'values'],
        },
      },
      async run(input) {
        const values = normalizeValues(input?.values)
        if (!input?.file_id || !input?.range || !values) return { error: 'faltan file_id, range o values (matriz de filas)' }
        // Escribir desde la celda inicial: Sheets dimensiona según la matriz, evitando el 400
        // "tried writing to column/row X" que hacía loopear al modelo hasta agotar iteraciones.
        const r = await google.updateSheetValues(input.file_id, startCell(input.range), values)
        return { ok: true, updated_range: r.updatedRange ?? input.range, updated_cells: r.updatedCells ?? null }
      },
    },
    'drive.append': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_append',
        description:
          'Agrega filas al final de una tabla, insertando filas nuevas. CUIDADO: Sheets ancla el append a la tabla que contiene el range; si la pestaña tiene un TÍTULO en las primeras filas, un range abierto ("A:M") se ancla al título e inserta en el lugar equivocado, desplazando datos y rompiendo fórmulas. Para agregar un registro en una pestaña con títulos, PREFERÍ drive_update en la primera fila vacía después de los datos (no desplaza). Usá drive_append solo si el range cae dentro de la tabla real de datos (ej. la fila de encabezados). Pasá file_id, range y values.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del Sheet destino' },
            range: { type: 'string', description: 'rango/tabla donde agregar, ej. "Caja!A:F"' },
            values: { type: 'array', description: 'matriz de filas a agregar', items: { type: 'array' } },
          },
          required: ['file_id', 'range', 'values'],
        },
      },
      async run(input) {
        const values = normalizeValues(input?.values)
        if (!input?.file_id || !input?.range || !values) return { error: 'faltan file_id, range o values (matriz de filas)' }
        const r = await google.appendSheetValues(input.file_id, input.range, values)
        return { ok: true, updated_range: r.updates?.updatedRange ?? null, appended_rows: r.updates?.updatedRows ?? values.length }
      },
    },
    'drive.create': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_create',
        description:
          'Crea un archivo NUEVO en el Drive del usuario (o en una carpeta si pasás folder_id): documento (doc), planilla (sheet), presentación (slides) o carpeta. Para un DOC podés pasar "contenido" (texto) y se crea con ese texto adentro. Devuelve el link. El OS actúa como el usuario autorizado, así que puede crear en cualquier carpeta suya.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'nombre del archivo/carpeta' },
            tipo: { type: 'string', enum: ['doc', 'sheet', 'slides', 'carpeta'], description: 'qué crear' },
            folder_id: { type: 'string', description: 'ID de la carpeta destino (opcional; si no, va a la raíz del Drive del usuario)' },
            contenido: { type: 'string', description: 'solo para doc: texto inicial del documento' },
          },
          required: ['name', 'tipo'],
        },
      },
      async run(input) {
        const tipo = String(input?.tipo || '').toLowerCase()
        const mimeType = TIPO_MIME[tipo]
        if (!input?.name || !mimeType) return { error: 'faltan name o tipo válido ("doc"|"sheet"|"slides"|"carpeta")' }
        try {
          // Doc con contenido: usar createDoc (crea + inserta texto en un solo paso).
          if ((tipo === 'doc' || tipo === 'documento') && input?.contenido) {
            const d = await google.createDoc(input.name, input.contenido, { parentId: input.folder_id })
            return { ok: true, id: d.id, name: input.name, link: d.link }
          }
          const f = await google.createFile({ name: input.name, mimeType, parents: input.folder_id ? [input.folder_id] : undefined })
          return { ok: true, id: f.id, name: f.name, link: f.webViewLink ?? null }
        } catch (e) {
          if (/storageQuota|quota has been exceeded/i.test(e?.message || '')) {
            return { error: 'no pude crear el archivo por almacenamiento. Verificá que el OS esté autorizado a actuar como tu cuenta (login de Google).' }
          }
          throw e
        }
      },
    },
    'drive.write_doc': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_write_doc',
        description:
          'Escribe TEXTO en un Google Doc: por defecto lo INSERTA al inicio; con modo="reemplazar" borra el contenido y escribe el texto nuevo; con modo="agregar" lo suma al final. Los Docs SÍ se escriben (vía la Docs API), no es una limitación. Pasá file_id y texto.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del Google Doc' },
            texto: { type: 'string', description: 'texto a escribir' },
            modo: { type: 'string', enum: ['insertar', 'agregar', 'reemplazar'], description: 'insertar (inicio, def), agregar (final) o reemplazar (todo)' },
          },
          required: ['file_id', 'texto'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.texto) return { error: 'faltan file_id o texto' }
        try {
          const r = await google.writeDoc(input.file_id, String(input.texto), { modo: input?.modo || 'insertar' })
          return { ok: true, file_id: input.file_id, modo: input?.modo || 'insertar', link: `https://docs.google.com/document/d/${input.file_id}/edit`, ...r }
        } catch (e) { return { error: `no pude escribir el Doc: ${String(e?.message ?? e).slice(0, 160)}` } }
      },
    },
    'drive.rename': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_rename',
        description: 'Renombra un archivo o carpeta existente de Drive. Pasá file_id y new_name. REQUIERE aprobación humana.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, new_name: { type: 'string' } },
          required: ['file_id', 'new_name'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.new_name) return { error: 'faltan file_id o new_name' }
        const r = await google.renameFile(input.file_id, input.new_name)
        return { ok: true, id: r.id, name: r.name }
      },
    },
    'drive.move': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_move',
        description: 'Mueve un archivo o carpeta a otra carpeta de Drive (para ORGANIZAR). Pasá file_id y folder_id (carpeta destino; buscala con drive_list/drive_find). REQUIERE aprobación humana.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, folder_id: { type: 'string', description: 'ID de la carpeta destino' } },
          required: ['file_id', 'folder_id'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.folder_id) return { error: 'faltan file_id o folder_id (carpeta destino)' }
        const r = await google.moveFile(input.file_id, input.folder_id)
        return { ok: true, id: r.id, name: r.name, parents: r.parents }
      },
    },
    'drive.batchupdate': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_batch_update',
        description:
          'Escribe VARIOS rangos de un Google Sheet en UNA sola operación (potente y rápido): ideal para completar un bloque entero de un presupuesto de una vez, no celda por celda. Pasá file_id y updates = lista de { range, values } (cada values es matriz de filas). REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            updates: { type: 'array', description: 'lista de {range, values}', items: { type: 'object' } },
          },
          required: ['file_id', 'updates'],
        },
      },
      async run(input) {
        if (!input?.file_id || !Array.isArray(input?.updates) || !input.updates.length) return { error: 'faltan file_id o updates [{range, values}]' }
        const data = input.updates.map((u) => ({ range: startCell(u.range), majorDimension: 'ROWS', values: normalizeValues(u.values) || [] })).filter((d) => d.range)
        const r = await google.batchUpdateValues(input.file_id, data)
        return { ok: true, updated_ranges: r.responses?.map((x) => x.updatedRange) ?? null, total_updated_cells: r.totalUpdatedCells ?? null }
      },
    },
    'drive.insertrows': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_insert_rows',
        description:
          'Inserta N filas VACÍAS en una pestaña, a partir de una fila (empuja el resto hacia abajo sin romper nada). Para agregar espacio en medio de una tabla. Pasá file_id, tab (nombre de la pestaña), at_row (fila 1-based donde insertar) y count. REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, tab: { type: 'string' }, at_row: { type: 'number' }, count: { type: 'number' } },
          required: ['file_id', 'tab', 'at_row', 'count'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab || !input?.at_row || !input?.count) return { error: 'faltan file_id, tab, at_row o count' }
        const meta = (await google.getSheetMeta(input.file_id)).find((s) => s.title === input.tab)
        if (!meta) return { error: `no encontré la pestaña "${input.tab}"` }
        const start = Math.max(0, input.at_row - 1)
        await google.spreadsheetBatchUpdate(input.file_id, [{ insertDimension: { range: { sheetId: meta.sheetId, dimension: 'ROWS', startIndex: start, endIndex: start + input.count }, inheritFromBefore: start > 0 } }])
        return { ok: true, inserted: input.count, at_row: input.at_row, tab: input.tab }
      },
    },
    'drive.deleterows': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_delete_rows',
        description:
          'Borra N filas de una pestaña a partir de una fila (elimina filas enteras, sube el resto). Pasá file_id, tab, from_row (1-based) y count. REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, tab: { type: 'string' }, from_row: { type: 'number' }, count: { type: 'number' } },
          required: ['file_id', 'tab', 'from_row', 'count'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab || !input?.from_row || !input?.count) return { error: 'faltan file_id, tab, from_row o count' }
        const meta = (await google.getSheetMeta(input.file_id)).find((s) => s.title === input.tab)
        if (!meta) return { error: `no encontré la pestaña "${input.tab}"` }
        const start = Math.max(0, input.from_row - 1)
        await google.spreadsheetBatchUpdate(input.file_id, [{ deleteDimension: { range: { sheetId: meta.sheetId, dimension: 'ROWS', startIndex: start, endIndex: start + input.count } } }])
        return { ok: true, deleted: input.count, from_row: input.from_row, tab: input.tab }
      },
    },
    'drive.clear': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_clear',
        description: 'Vacía el contenido de un rango de celdas (sin borrar el formato). Pasá file_id y range (ej. "Presupuesto!B5:F40"). REQUIERE aprobación.',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, range: { type: 'string' } }, required: ['file_id', 'range'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const r = await google.clearValues(input.file_id, input.range)
        return { ok: true, cleared_range: r.clearedRange ?? input.range }
      },
    },
    'drive.copy': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_copy',
        description:
          'DUPLICA un archivo existente (una plantilla o un presupuesto anterior) para partir de él. CLAVE para armar un presupuesto nuevo desde uno parecido. Pasá file_id (a copiar), name (nombre de la copia) y opcional folder_id (dónde dejarla). REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, name: { type: 'string' }, folder_id: { type: 'string' } },
          required: ['file_id', 'name'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.name) return { error: 'faltan file_id o name' }
        try {
          const f = await google.copyFile(input.file_id, input.name, input.folder_id ? [input.folder_id] : undefined)
          return { ok: true, id: f.id, name: f.name, link: f.webViewLink ?? null, navigate: f.webViewLink ? { url: f.webViewLink, name: f.name, file_id: f.id } : undefined }
        } catch (e) {
          if (/storageQuota|quota/i.test(e?.message || '')) return { error: 'la copia quedaría a nombre de la cuenta del OS, que no tiene almacenamiento. Para que el OS duplique solo, hace falta una Unidad Compartida. Por ahora duplicá vos el archivo (clic derecho → Hacer una copia) y compartímelo.' }
          throw e
        }
      },
    },
    'drive.trash': {
      capability: 'drive.write', // Baja REVERSIBLE (papelera) → requiere aprobación, no es Nivel F
      account: 'ecsas',
      schema: {
        name: 'drive_trash',
        description: 'Da de BAJA un archivo/carpeta mandándolo a la PAPELERA (reversible, se puede restaurar 30 días). Pasá file_id. REQUIERE aprobación. (El borrado definitivo sigue prohibido.)',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
      },
      async run(input) {
        if (!input?.file_id) return { error: 'falta file_id' }
        const r = await google.trashFile(input.file_id)
        return { ok: true, id: r.id, name: r.name, trashed: r.trashed }
      },
    },
    'drive.delete': {
      capability: 'drive.delete', // Nivel F → la policy lo deja SIEMPRE forbidden; run nunca se alcanza
      account: 'ecsas',
      schema: {
        name: 'drive_delete',
        description:
          'Eliminar un archivo de Drive. PROHIBIDO de forma autónoma (Nivel F): el OS nunca borra por su cuenta. Existe solo para que quede registrado y denegado por la policy.',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
      },
      async run() {
        return { error: 'drive.delete es Nivel F (prohibido): no se ejecuta nunca de forma autónoma' }
      },
    },
  }
}
