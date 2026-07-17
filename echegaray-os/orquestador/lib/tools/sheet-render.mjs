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
        description: 'ARMA/REHACE una tabla o reporte en un Google Sheet de UNA SOLA VEZ (valores + formato + títulos + combinaciones + congelar, todo en una pasada). USALO para construir o reescribir contenido de un Sheet — es MUCHO más rápido y barato que ir celda por celda con drive_update/format/merge (NO lo hagas así, quema créditos y queda desalineado). ⚠️ NUNCA regeneres de memoria una pestaña grande con datos que ya existen (ej. un RESUMEN de 100+ filas con muchas secciones): NO entra en una sola respuesta, se corta a la mitad y PERDÉS secciones. Si la pestaña ya tiene datos y solo hay que ARREGLAR formato/alineación, tocá SOLO eso; si el RESUMEN debe reflejar otras pestañas, usá FÓRMULAS que las referencien (no vuelvas a tipear los datos). Pasá file_id, tab (pestaña destino ya existente), anclaje (celda A1 de arranque, ej "A1"), filas (array de filas; cada fila = array de celdas), congelar_encabezado, y limpiar_pestana:true para limpiar las filas que estás reescribiendo antes de escribirlas (limpia SOLO ese rango, NO borra el resto de la pestaña — así nunca perdés lo que no reescribís; para ACORTAR una pestaña borrá el sobrante aparte con drive_clear). Cada celda es {t:texto} o {n:número} o {f:"=fórmula"}, con estilo opcional ("titulo"|"encabezado"|"etiqueta"|"moneda"|"moneda_negrita"|"total"|"pct"|"normal") y combinar:N (combinar a lo ancho de N columnas, para títulos). Totales/subtotales SIEMPRE {f:"=SUM(...)"} (fórmula), NUNCA número tipeado. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
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
        // 0a) AGRANDAR LA GRILLA si el bloque no entra. Antes, si el reporte era más ancho o más
        //    largo que las dimensiones actuales de la pestaña, updateCells tiraba 400 "Attempting
        //    to write column N beyond the grid" — y como va en el batch de CONTENIDO, se caía TODA
        //    la escritura (le pasó al dueño: "no completa el dato"). Crecemos la grilla PRIMERO, en
        //    el mismo batch atómico (ampliar rowCount/columnCount nunca falla), así el updateCells
        //    siempre entra. Solo si conocemos las dims actuales (meta las reporta) y hacen falta.
        const needRows = r0 + filas.length
        const needCols = c0 + ancho
        const grow = {}
        if (Number(hoja.rows) > 0 && needRows > Number(hoja.rows)) grow.rowCount = needRows
        if (Number(hoja.cols) > 0 && needCols > Number(hoja.cols)) grow.columnCount = needCols
        if (grow.rowCount || grow.columnCount) {
          requests.push({ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: grow }, fields: Object.keys(grow).map((k) => `gridProperties.${k}`).join(',') } })
        }
        // 0b) LIMPIEZA ACOTADA (no destructiva). Antes esto borraba la PESTAÑA ENTERA a ciegas:
        //    si la tarea se cortaba (tope de costo / max_tokens) DESPUÉS de limpiar y ANTES de
        //    reescribir todo, se perdían secciones enteras (le pasó al dueño: se borró §7 Deudas).
        //    Ahora limpia SOLO las filas que este render reescribe (del anclaje al final del
        //    bloque), en TODAS las columnas → saca restos a la derecha que "parten" la tabla,
        //    SIN tocar filas fuera del bloque. Atómico con la escritura: nunca deja un hueco.
        //    Lo de abajo del bloque NO se borra (si querés ACORTAR la pestaña, borralo aparte con
        //    drive_clear un rango explícito). Esto hace imposible perder datos que no reescribiste.
        if (input.limpiar_pestana) {
          const rango = { sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r0 + filas.length }
          requests.push({ unmergeCells: { range: rango } })
          requests.push({ updateCells: { range: rango, fields: 'userEnteredValue,userEnteredFormat' } })
        }
        // 1) valores + formato de TODO el bloque en UN updateCells
        const rows = filas.map((fila) => ({ values: (Array.isArray(fila) ? fila : [fila]).map(toCellData) }))
        requests.push({
          updateCells: { rows, fields: 'userEnteredValue,userEnteredFormat', start: { sheetId: hoja.sheetId, rowIndex: r0, columnIndex: c0 } },
        })
        // 2) limpiar merges previos en el bloque (evita 400)
        requests.push({ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r0 + filas.length, startColumnIndex: c0, endColumnIndex: c0 + ancho } } })
        // Las COMBINACIONES (combinar:N) van APARTE, no en el batch de contenido: si la pestaña
        // tiene una tabla dinámica (o celdas combinadas raras), mergeCells tira 400 — y si fuera
        // atómico con la escritura, se caería TODO el render (le pasó al dueño: "No puedes combinar
        // celdas que formen parte de una tabla dinámica" → no escribió nada). Se aplican best-effort.
        const mergeReqs = []
        filas.forEach((fila, ri) => {
          if (!Array.isArray(fila)) return
          let ci = 0
          for (const cell of fila) {
            const span = (cell && typeof cell === 'object' && Number(cell.combinar) > 1) ? Number(cell.combinar) : 1
            if (span > 1) mergeReqs.push({ mergeCells: { mergeType: 'MERGE_ALL', range: { sheetId: hoja.sheetId, startRowIndex: r0 + ri, endRowIndex: r0 + ri + 1, startColumnIndex: c0 + ci, endColumnIndex: c0 + ci + span } } })
            ci += span
          }
        })
        // 3) ESCRIBIR el contenido (valores+formato) — atómico y OBLIGATORIO.
        await google.spreadsheetBatchUpdate(input.file_id, requests)
        // 3b) aplicar las combinaciones de títulos — best-effort (una tabla dinámica no las deja).
        let mergeNota = ''
        if (mergeReqs.length) {
          try { await google.spreadsheetBatchUpdate(input.file_id, mergeReqs) }
          catch { mergeNota = ' (no pude combinar los títulos —¿hay una tabla dinámica en la pestaña?—, pero el contenido quedó escrito).' }
        }
        // 4) congelar encabezado: VA APARTE, NO en el batch de arriba. Si la pestaña tiene una
        //    celda combinada que cruza la línea de freeze, updateSheetProperties tira 400 — y si
        //    estuviera en el mismo batch atómico, se caería TODA la escritura (el contenido se
        //    perdía = "no escribió nada"). Como paso separado, un freeze fallido es cosmético: el
        //    contenido YA quedó escrito. Fallo suave, con nota.
        let freezeNota = ''
        if (input.congelar_encabezado) {
          try {
            await google.spreadsheetBatchUpdate(input.file_id, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: r0 + 1 } }, fields: 'gridProperties.frozenRowCount' } }])
          } catch {
            freezeNota = ' (no pude congelar el encabezado por una celda combinada, pero el contenido quedó escrito).'
          }
        }
        return { ok: true, tab: input.tab, filas: filas.length, columnas: ancho, requests: requests.length, nota: 'Tabla escrita (valores+formato).' + mergeNota + freezeNota }
      },
    },
  }
}
