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
const FOLDER = 'application/vnd.google-apps.folder'
const TIPO_MIME = { doc: DOC, documento: DOC, sheet: SHEET, planilla: SHEET, carpeta: FOLDER, folder: FOLDER }

/** Valida que `values` sea una matriz de filas (array de arrays de celdas). */
function normalizeValues(values) {
  if (!Array.isArray(values)) return null
  if (values.length && !Array.isArray(values[0])) return values.map((v) => [v]) // una columna
  return values
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
        const r = await google.updateSheetValues(input.file_id, input.range, values)
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
          'Crea un archivo NUEVO propio del OS en Drive: un documento (doc), una planilla (sheet) o una carpeta. Pasá name, tipo ("doc"|"sheet"|"carpeta") y opcional folder_id para ubicarlo. REQUIERE aprobación humana.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'nombre del archivo/carpeta' },
            tipo: { type: 'string', enum: ['doc', 'sheet', 'carpeta'], description: 'qué crear' },
            folder_id: { type: 'string', description: 'ID de la carpeta contenedora (opcional)' },
          },
          required: ['name', 'tipo'],
        },
      },
      async run(input) {
        const mimeType = TIPO_MIME[String(input?.tipo || '').toLowerCase()]
        if (!input?.name || !mimeType) return { error: 'faltan name o tipo válido ("doc"|"sheet"|"carpeta")' }
        try {
          const f = await google.createFile({ name: input.name, mimeType, parents: input.folder_id ? [input.folder_id] : undefined })
          return { ok: true, id: f.id, name: f.name, link: f.webViewLink ?? null }
        } catch (e) {
          // La cuenta de servicio no tiene almacenamiento propio: crear un archivo
          // NUEVO suelto falla. Editar archivos EXISTENTES compartidos sí funciona.
          if (/storageQuota|quota has been exceeded/i.test(e?.message || '')) {
            return { error: 'no puedo crear un archivo nuevo desde cero (la cuenta de servicio no tiene almacenamiento propio). Sí puedo EDITAR un archivo existente compartido conmigo: creá el archivo vacío y compartímelo, o decime en cuál escribir.' }
          }
          throw e
        }
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
