// MEJORA SISTÉMICA de cómo el OS trabaja en Sheets. Antes el modelo armaba un reporte
// POKE POR POKE (escribir celda → formatear → combinar → congelar…), 26 idas y vueltas:
// caro, lento, inconsistente, y se cortaba a mitad dejando todo desalineado. Acá el modelo
// DECLARA la tabla/reporte ENTERO una vez y este renderizador lo escribe en UNA SOLA pasada
// válida (un solo batchUpdate: valores + formato + combinaciones + freeze). Colapsa ~26
// iteraciones → ~2, elimina los 400 de formato (los requests los arma el tool, no el modelo)
// y sale alineado SIEMPRE. Sirve para CUALQUIER tabla, no una pestaña puntual.
import { a1ToGridRange } from './sheets-format.mjs'

// Estilos con nombre → formato correcto por construcción. El modelo elige el nombre, no arma
// el objeto de formato (ahí es donde erraba). Colores/monedas en criterio sobrio es-AR.
const MONEDA = { type: 'CURRENCY', pattern: '"$"#,##0' }
const PORCENT = { type: 'PERCENT', pattern: '0.0%' }
const BLANCO = { red: 1, green: 1, blue: 1 }
const OSCURO = { red: 0.12, green: 0.15, blue: 0.22 }
const GRIS = { red: 0.93, green: 0.94, blue: 0.96 }
const ESTILOS = {
  titulo: { textFormat: { bold: true, fontSize: 12, foregroundColor: BLANCO }, backgroundColor: OSCURO, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' },
  encabezado: { textFormat: { bold: true }, backgroundColor: GRIS, horizontalAlignment: 'CENTER' },
  etiqueta: { textFormat: { bold: true } },
  moneda: { numberFormat: MONEDA },
  moneda_negrita: { textFormat: { bold: true }, numberFormat: MONEDA },
  total: { textFormat: { bold: true }, backgroundColor: GRIS, numberFormat: MONEDA },
  pct: { numberFormat: PORCENT },
  normal: {},
}

/** Una celda del spec → CellData de la API (valor + formato del estilo). */
function toCellData(cell) {
  if (cell == null || cell === '') return {}
  const c = typeof cell === 'object' ? cell : { t: String(cell) }
  const cd = { userEnteredFormat: { ...(ESTILOS[c.estilo] || {}) } }
  if (c.f != null) cd.userEnteredValue = { formulaValue: String(c.f).startsWith('=') ? String(c.f) : '=' + c.f }
  else if (c.n != null && c.n !== '') cd.userEnteredValue = { numberValue: Number(c.n) }
  else if (c.t != null && c.t !== '') cd.userEnteredValue = { stringValue: String(c.t) }
  return cd
}

export function sheetRenderTools(google) {
  return {
    'sheet.render': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_render_tabla',
        description: 'ARMA/REHACE una tabla, reporte o PESTAÑA ENTERA en un Google Sheet de UNA SOLA VEZ (valores + formato + títulos + combinaciones + congelar, todo en una pasada). USALO SIEMPRE para construir o rehacer contenido de un Sheet — es MUCHO más rápido y barato que ir celda por celda con drive_update/format/merge (NO lo hagas así, quema créditos y queda desalineado). Para REHACER UNA PESTAÑA COMPLETA: leé toda la pestaña primero, armá TODAS sus filas (todas las secciones, con columnas alineadas entre sí) y pasalas juntas con limpiar_pestana:true. Pasá file_id, tab (pestaña destino ya existente), anclaje (celda A1 de arranque, ej "A1"), filas (array de filas; cada fila = array de celdas), congelar_encabezado, y limpiar_pestana:true para BORRAR todo lo previo de la pestaña y escribirla entera de nuevo (rehacer completo). Cada celda es {t:texto} o {n:número} o {f:"=fórmula"}, con estilo opcional ("titulo"|"encabezado"|"etiqueta"|"moneda"|"moneda_negrita"|"total"|"pct"|"normal") y combinar:N (combinar a lo ancho de N columnas, para títulos). Totales/subtotales SIEMPRE {f:"=SUM(...)"} (fórmula), NUNCA número tipeado. REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            tab: { type: 'string', description: 'pestaña destino (debe existir; creála antes con drive_add_tab si no está)' },
            anclaje: { type: 'string', description: 'celda A1 de la esquina superior izquierda, ej "A1" o "B3" (default A1)' },
            filas: { type: 'array', description: 'array de filas; cada fila = array de celdas {t|n|f, estilo?, combinar?}', items: { type: 'array' } },
            congelar_encabezado: { type: 'boolean', description: 'fija la primera fila (encabezados) al hacer scroll' },
            limpiar_pestana: { type: 'boolean', description: 'true = BORRA todo el contenido y formato previo de la pestaña antes de escribir (para REHACER la pestaña completa de una)' },
          },
          required: ['file_id', 'tab', 'filas'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab || !Array.isArray(input?.filas) || !input.filas.length) return { error: 'faltan file_id, tab o filas' }
        const meta = await google.getSheetMeta(input.file_id)
        const hoja = meta.find((m) => m.title === input.tab)
        if (!hoja) return { error: `no encontré la pestaña "${input.tab}" (creála antes con drive_add_tab)` }
        const ancla = a1ToGridRange(meta, `${input.tab}!${input.anclaje || 'A1'}`, input.tab)
        if (!ancla || ancla.startRowIndex == null) return { error: `anclaje inválido: "${input.anclaje}"` }
        const r0 = ancla.startRowIndex, c0 = ancla.startColumnIndex
        const filas = input.filas
        const ancho = Math.max(...filas.map((f) => (Array.isArray(f) ? f.length : 1)))

        const requests = []
        // 0) REHACER PESTAÑA COMPLETA: limpiar TODO el contenido/formato y merges previos de la
        //    pestaña, así se reescribe entera sin restos ni partes sueltas (pedido del dueño:
        //    contemplar la pestaña ENTERA, no un pedazo).
        if (input.limpiar_pestana) {
          requests.push({ unmergeCells: { range: { sheetId: hoja.sheetId } } })
          requests.push({ updateCells: { range: { sheetId: hoja.sheetId }, fields: 'userEnteredValue,userEnteredFormat' } })
        }
        // 1) valores + formato de TODO el bloque en UN updateCells
        const rows = filas.map((fila) => ({ values: (Array.isArray(fila) ? fila : [fila]).map(toCellData) }))
        requests.push({
          updateCells: { rows, fields: 'userEnteredValue,userEnteredFormat', start: { sheetId: hoja.sheetId, rowIndex: r0, columnIndex: c0 } },
        })
        // 2) limpiar merges previos en el bloque (evita 400) y aplicar los del spec (combinar:N)
        requests.push({ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r0 + filas.length, startColumnIndex: c0, endColumnIndex: c0 + ancho } } })
        filas.forEach((fila, ri) => {
          if (!Array.isArray(fila)) return
          let ci = 0
          for (const cell of fila) {
            const span = (cell && typeof cell === 'object' && Number(cell.combinar) > 1) ? Number(cell.combinar) : 1
            if (span > 1) requests.push({ mergeCells: { mergeType: 'MERGE_ALL', range: { sheetId: hoja.sheetId, startRowIndex: r0 + ri, endRowIndex: r0 + ri + 1, startColumnIndex: c0 + ci, endColumnIndex: c0 + ci + span } } })
            ci += span
          }
        })
        // 3) congelar encabezado (opcional)
        if (input.congelar_encabezado) requests.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: r0 + 1 } }, fields: 'gridProperties.frozenRowCount' } })

        await google.spreadsheetBatchUpdate(input.file_id, requests)
        return { ok: true, tab: input.tab, filas: filas.length, columnas: ancho, requests: requests.length, nota: 'Tabla escrita en UNA sola pasada (valores+formato+merges+freeze).' }
      },
    },
  }
}
