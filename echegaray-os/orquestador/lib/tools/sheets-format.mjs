// SUPERPODERES de Google Sheets para el chat del OS: además de escribir valores (drive_update
// / drive_batch_update) y crear pestañas (drive_add_tab), estas tools dan FORMATO, gráficos,
// imágenes, tablas con estilo, combinar/congelar celdas y borrar/renombrar pestañas — todo
// vía la Sheets API (spreadsheets:batchUpdate). Capability 'drive.write' (mismo trato que el
// resto de la escritura). Un solo módulo, cerrado sobre el cliente Google con WRITE_SCOPES.
//
// Diseño: cada tool acepta un rango A1 con la pestaña ("'Panel Caja'!B2:D10") y resuelve por
// dentro el sheetId numérico (getSheetMeta) + convierte el A1 a GridRange. Así el modelo NUNCA
// tiene que conocer el sheetId, que es la causa #1 de errores al formatear.

/** Letra(s) de columna → índice 0-based ("A"→0, "Z"→25, "AA"→26). */
function colToIdx(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Separa "B12" en { col:"B", row:"12" } (cualquiera puede faltar: "B", "12"). */
function splitCell(a1) {
  const m = /^([A-Za-z]*)(\d*)$/.exec(String(a1 || '').trim())
  return { col: m?.[1] || '', row: m?.[2] || '' }
}

/** Convierte un rango A1 con pestaña ("'Mi Hoja'!B2:D10", "Hoja!B:D", "Hoja!2:5") a GridRange
 *  { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } (0-based, fin
 *  EXCLUSIVO). Índices ausentes = dimensión abierta (toda la columna/fila). Devuelve null si
 *  no encuentra la pestaña. `tabFallback` se usa si el rango no trae "Pestaña!". */
export function a1ToGridRange(meta, fullRange, tabFallback) {
  const s = String(fullRange || '')
  const bang = s.lastIndexOf('!')
  let tab = bang >= 0 ? s.slice(0, bang) : tabFallback || null
  if (tab) tab = tab.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'")
  const a1 = bang >= 0 ? s.slice(bang + 1) : s
  const sheet = (meta || []).find((x) => (tab ? x.title === tab : true))
  if (!sheet) return null
  const [aRaw, bRaw] = a1.split(':')
  const a = splitCell(aRaw)
  const b = bRaw ? splitCell(bRaw) : a
  const gr = { sheetId: sheet.sheetId }
  const cols = [a.col && colToIdx(a.col), b.col && colToIdx(b.col)].filter((v) => v !== '' && v !== false)
  const rows = [a.row && parseInt(a.row, 10), b.row && parseInt(b.row, 10)].filter((v) => v !== '' && v !== false)
  if (a.col || b.col) {
    const c1 = a.col ? colToIdx(a.col) : 0
    const c2 = b.col ? colToIdx(b.col) : (a.col ? colToIdx(a.col) : 0)
    gr.startColumnIndex = Math.min(c1, c2)
    gr.endColumnIndex = Math.max(c1, c2) + 1
  }
  if (a.row || b.row) {
    const r1 = a.row ? parseInt(a.row, 10) - 1 : 0
    const r2 = b.row ? parseInt(b.row, 10) - 1 : (a.row ? parseInt(a.row, 10) - 1 : 0)
    gr.startRowIndex = Math.min(r1, r2)
    gr.endRowIndex = Math.max(r1, r2) + 1
  }
  void cols; void rows
  return gr
}

/** "#1a73e8" / "1a73e8" → { red, green, blue } en 0..1. Acepta también algunos nombres. */
const NOMBRES_COLOR = {
  blanco: 'ffffff', negro: '000000', rojo: 'e06666', verde: '93c47d', azul: '6d9eeb',
  amarillo: 'ffd966', naranja: 'f6b26b', gris: 'cccccc', grisclaro: 'efefef', celeste: 'cfe2f3',
}
function hexToColor(hex) {
  if (!hex) return null
  let h = String(hex).trim().toLowerCase().replace(/^#/, '')
  if (NOMBRES_COLOR[h]) h = NOMBRES_COLOR[h]
  if (!/^[0-9a-f]{6}$/.test(h)) return null
  return { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 }
}

const NUMFMT = {
  moneda: { type: 'CURRENCY', pattern: '"$"#,##0.00' },
  pesos: { type: 'CURRENCY', pattern: '"$"#,##0' },
  porcentaje: { type: 'PERCENT', pattern: '0.0%' },
  numero: { type: 'NUMBER', pattern: '#,##0.00' },
  entero: { type: 'NUMBER', pattern: '#,##0' },
  fecha: { type: 'DATE', pattern: 'dd/mm/yyyy' },
  texto: { type: 'TEXT', pattern: '@' },
}
const ALIGN_H = { izquierda: 'LEFT', centro: 'CENTER', centrado: 'CENTER', derecha: 'RIGHT' }
const ALIGN_V = { arriba: 'TOP', medio: 'MIDDLE', centro: 'MIDDLE', abajo: 'BOTTOM' }
const CHART_TIPO = { columna: 'COLUMN', columnas: 'COLUMN', barra: 'BAR', barras: 'BAR', linea: 'LINE', lineas: 'LINE', área: 'AREA', area: 'AREA' }

async function resolveGrid(google, file_id, range, tab) {
  const meta = await google.getSheetMeta(file_id)
  const gr = a1ToGridRange(meta, range, tab)
  return { meta, gr }
}

/** Registry de superpoderes de Sheets, cerrado sobre un cliente Google con WRITE_SCOPES. */
export function sheetsFormatTools(google) {
  if (!google) return {}
  return {
    'drive.formatcells': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_format_cells',
        description:
          'Da FORMATO a un rango de celdas de un Google Sheet: negrita, itálica, tamaño y color de letra, color de fondo, formato de número (moneda/porcentaje/entero/fecha/texto), alineación, ajuste de texto y bordes. Pasá file_id y range CON la pestaña (ej. "\'Panel Caja\'!A1:D1"). Combinables. Ejemplos: encabezado → { negrita:true, fondo:"#1a73e8", color_letra:"blanco", alineacion:"centro" }; columna de plata → { formato_numero:"moneda" }. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            range: { type: 'string', description: 'rango A1 con pestaña, ej. "Hoja!A1:D10"' },
            negrita: { type: 'boolean' },
            italica: { type: 'boolean' },
            tamano_letra: { type: 'number', description: 'tamaño de fuente en pt' },
            color_letra: { type: 'string', description: 'hex "#333" o nombre (blanco/negro/rojo…)' },
            fondo: { type: 'string', description: 'color de fondo hex o nombre' },
            formato_numero: { type: 'string', enum: ['moneda', 'pesos', 'porcentaje', 'numero', 'entero', 'fecha', 'texto'] },
            alineacion: { type: 'string', enum: ['izquierda', 'centro', 'derecha'] },
            alineacion_vertical: { type: 'string', enum: ['arriba', 'medio', 'abajo'] },
            ajustar_texto: { type: 'boolean', description: 'wrap: el texto largo baja de línea dentro de la celda' },
            bordes: { type: 'boolean', description: 'bordes finos en todas las celdas del rango' },
          },
          required: ['file_id', 'range'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const { gr } = await resolveGrid(google, input.file_id, input.range)
        if (!gr) return { error: `no encontré la pestaña del rango "${input.range}" (¿está bien el nombre?)` }
        const cell = { userEnteredFormat: {} }
        const fields = []
        const tf = {}
        if (input.negrita != null) { tf.bold = !!input.negrita; fields.push('textFormat.bold') }
        if (input.italica != null) { tf.italic = !!input.italica; fields.push('textFormat.italic') }
        if (input.tamano_letra) { tf.fontSize = Number(input.tamano_letra); fields.push('textFormat.fontSize') }
        if (input.color_letra) { const c = hexToColor(input.color_letra); if (c) { tf.foregroundColor = c; fields.push('textFormat.foregroundColor') } }
        if (Object.keys(tf).length) cell.userEnteredFormat.textFormat = tf
        if (input.fondo) { const c = hexToColor(input.fondo); if (c) { cell.userEnteredFormat.backgroundColor = c; fields.push('backgroundColor') } }
        if (input.formato_numero && NUMFMT[input.formato_numero]) { cell.userEnteredFormat.numberFormat = NUMFMT[input.formato_numero]; fields.push('numberFormat') }
        if (input.alineacion && ALIGN_H[input.alineacion]) { cell.userEnteredFormat.horizontalAlignment = ALIGN_H[input.alineacion]; fields.push('horizontalAlignment') }
        if (input.alineacion_vertical && ALIGN_V[input.alineacion_vertical]) { cell.userEnteredFormat.verticalAlignment = ALIGN_V[input.alineacion_vertical]; fields.push('verticalAlignment') }
        if (input.ajustar_texto != null) { cell.userEnteredFormat.wrapStrategy = input.ajustar_texto ? 'WRAP' : 'OVERFLOW_CELL'; fields.push('wrapStrategy') }
        const requests = []
        if (fields.length) requests.push({ repeatCell: { range: gr, cell, fields: 'userEnteredFormat(' + fields.join(',') + ')' } })
        if (input.bordes) {
          const b = { style: 'SOLID', color: { red: 0.7, green: 0.7, blue: 0.7 } }
          requests.push({ updateBorders: { range: gr, top: b, bottom: b, left: b, right: b, innerHorizontal: b, innerVertical: b } })
        }
        if (!requests.length) return { error: 'no indicaste ningún formato a aplicar' }
        await google.spreadsheetBatchUpdate(input.file_id, requests)
        return { ok: true, range: input.range, aplicado: fields.concat(input.bordes ? ['bordes'] : []) }
      },
    },
    'drive.deletetab': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_delete_tab',
        description: 'BORRA una pestaña (hoja) entera de un Google Sheet. Irreversible (la pestaña y sus datos se pierden). Pasá file_id y tab (nombre de la pestaña). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, tab: { type: 'string' } }, required: ['file_id', 'tab'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id o tab' }
        const meta = await google.getSheetMeta(input.file_id)
        const s = meta.find((x) => x.title === input.tab)
        if (!s) return { error: `no encontré la pestaña "${input.tab}"` }
        if (meta.length <= 1) return { error: 'no puedo borrar la única pestaña del archivo (un Sheet necesita al menos una)' }
        await google.spreadsheetBatchUpdate(input.file_id, [{ deleteSheet: { sheetId: s.sheetId } }])
        return { ok: true, borrada: input.tab }
      },
    },
    'drive.renametab': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_rename_tab',
        description: 'Renombra una pestaña de un Google Sheet. Pasá file_id, tab (nombre actual) y nuevo_nombre. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, tab: { type: 'string' }, nuevo_nombre: { type: 'string' } }, required: ['file_id', 'tab', 'nuevo_nombre'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab || !input?.nuevo_nombre) return { error: 'faltan file_id, tab o nuevo_nombre' }
        const s = (await google.getSheetMeta(input.file_id)).find((x) => x.title === input.tab)
        if (!s) return { error: `no encontré la pestaña "${input.tab}"` }
        await google.spreadsheetBatchUpdate(input.file_id, [{ updateSheetProperties: { properties: { sheetId: s.sheetId, title: input.nuevo_nombre }, fields: 'title' } }])
        return { ok: true, antes: input.tab, ahora: input.nuevo_nombre }
      },
    },
    'drive.mergecells': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_merge_cells',
        description: 'Combina (o descombina) celdas de un Google Sheet. Ideal para un título que cruza varias columnas. Pasá file_id, range (con pestaña) y tipo: "todo" (una sola celda), "columnas" (combina por fila), "filas" (por columna) o "descombinar". Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, range: { type: 'string' }, tipo: { type: 'string', enum: ['todo', 'columnas', 'filas', 'descombinar'] } },
          required: ['file_id', 'range'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const { gr } = await resolveGrid(google, input.file_id, input.range)
        if (!gr) return { error: `no encontré la pestaña del rango "${input.range}"` }
        if (input.tipo === 'descombinar') {
          // unmergeCells exige que el rango CONTENGA los merges completos; un rango ajustado que
          // corta una celda combinada tira 400 ("debes seleccionar todas las celdas"). Resiliente:
          // si falla, descombino la PESTAÑA ENTERA (lo que "arreglá la pestaña" casi siempre quiere).
          try {
            await google.spreadsheetBatchUpdate(input.file_id, [{ unmergeCells: { range: gr } }])
            return { ok: true, descombinado: input.range }
          } catch (e) {
            // GridRange con SOLO sheetId = la pestaña ENTERA → descombina todos los merges sin
            // depender de dimensiones ni cortar ninguno por la mitad.
            try {
              await google.spreadsheetBatchUpdate(input.file_id, [{ unmergeCells: { range: { sheetId: gr.sheetId } } }])
              return { ok: true, descombinado: 'toda la pestaña', nota: 'El rango cortaba celdas combinadas; descombiné la pestaña completa.' }
            } catch {
              return { ok: true, aplicado: false, nota: 'No pude descombinar por el rango dado; seguí sin eso, NO reintentes esta operación.' }
            }
          }
        }
        const mergeType = input.tipo === 'columnas' ? 'MERGE_ROWS' : input.tipo === 'filas' ? 'MERGE_COLUMNS' : 'MERGE_ALL'
        // mergeCells RESILIENTE: si el rango pisa un merge existente → 400 ("debes seleccionar
        // todas las celdas de un rango combinado"). Recuperación: des-combino primero ese rango y
        // reintento; si aún falla, salteo suave (combinar es cosmético, no vale trabar la tarea).
        try {
          await google.spreadsheetBatchUpdate(input.file_id, [{ mergeCells: { range: gr, mergeType } }])
          return { ok: true, combinado: input.range, tipo: input.tipo || 'todo' }
        } catch (e) {
          try {
            await google.spreadsheetBatchUpdate(input.file_id, [{ unmergeCells: { range: gr } }, { mergeCells: { range: gr, mergeType } }])
            return { ok: true, combinado: input.range, tipo: input.tipo || 'todo', nota: 'Había un merge previo; lo rehíce.' }
          } catch {
            return { ok: true, aplicado: false, nota: `No combiné "${input.range}" (pisa celdas ya combinadas); seguí sin eso, NO reintentes.` }
          }
        }
      },
    },
    'drive.freeze': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_freeze',
        description: 'Congela (fija) filas y/o columnas de una pestaña para que no se muevan al hacer scroll — típico: congelar la fila de encabezados. Pasá file_id, tab, filas (cuántas filas desde arriba) y/o columnas (desde la izquierda). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, tab: { type: 'string' }, filas: { type: 'number' }, columnas: { type: 'number' } }, required: ['file_id', 'tab'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id o tab' }
        const s = (await google.getSheetMeta(input.file_id)).find((x) => x.title === input.tab)
        if (!s) return { error: `no encontré la pestaña "${input.tab}"` }
        const wantRows = input.filas != null ? Number(input.filas) : null
        const wantCols = input.columnas != null ? Number(input.columnas) : null
        if (wantRows == null && wantCols == null) return { error: 'indicá filas y/o columnas a congelar' }
        const doFreeze = async (rows, cols) => {
          const gp = {}; const fields = []
          if (rows != null) { gp.frozenRowCount = rows; fields.push('gridProperties.frozenRowCount') }
          if (cols != null) { gp.frozenColumnCount = cols; fields.push('gridProperties.frozenColumnCount') }
          await google.spreadsheetBatchUpdate(input.file_id, [{ updateSheetProperties: { properties: { sheetId: s.sheetId, gridProperties: gp }, fields: fields.join(',') } }])
        }
        // Freeze RESILIENTE: si choca con celdas combinadas (400), reintenta solo filas (lo
        // habitual: fijar encabezado) y si tampoco, saltea con aviso SUAVE — nunca tira error
        // que haga al modelo reintentar en loop (causa real de "se clava con una pestaña").
        try {
          await doFreeze(wantRows, wantCols)
          return { ok: true, tab: input.tab, filas: wantRows ?? 0, columnas: wantCols ?? 0 }
        } catch (e) {
          const esMerge = /combinada|merged|inmoviliz|part of a merge/i.test(String(e?.message ?? e))
          if (esMerge && wantRows != null) {
            try { await doFreeze(wantRows, null); return { ok: true, tab: input.tab, filas: wantRows, columnas: 0, nota: 'Congelé solo las filas; las columnas tienen celdas combinadas que lo impiden.' } } catch { /* cae al aviso */ }
          }
          return { ok: true, aplicado: false, tab: input.tab, nota: `Salteé el freeze en "${input.tab}" (hay celdas combinadas). Seguí sin eso; NO reintentes esta operación.` }
        }
      },
    },
    'drive.autoresize': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_auto_resize',
        description: 'Ajusta automáticamente el ANCHO de las columnas de una pestaña al contenido (para que no queden textos cortados ni columnas gigantes). Pasá file_id, tab y opcional desde_columna/hasta_columna (letras, ej. "A"/"F"; si no, todas). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, tab: { type: 'string' }, desde_columna: { type: 'string' }, hasta_columna: { type: 'string' } }, required: ['file_id', 'tab'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id o tab' }
        const s = (await google.getSheetMeta(input.file_id)).find((x) => x.title === input.tab)
        if (!s) return { error: `no encontré la pestaña "${input.tab}"` }
        const startIndex = input.desde_columna ? colToIdx(input.desde_columna) : 0
        const endIndex = input.hasta_columna ? colToIdx(input.hasta_columna) + 1 : (s.gridProperties?.columnCount || 26)
        await google.spreadsheetBatchUpdate(input.file_id, [{ autoResizeDimensions: { dimensions: { sheetId: s.sheetId, dimension: 'COLUMNS', startIndex, endIndex } } }])
        return { ok: true, tab: input.tab, columnas: `${input.desde_columna || 'A'}–${input.hasta_columna || 'fin'}` }
      },
    },
    'drive.tablestyle': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_table_style',
        description: 'Convierte un rango en una TABLA con estilo: filas alternadas (cebra) y encabezado resaltado, para que se lea como tabla profesional. Pasá file_id, range (con pestaña, incluí la fila de encabezados) y opcional color (hex/nombre, def. azul). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, range: { type: 'string' }, color: { type: 'string' } }, required: ['file_id', 'range'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const { gr } = await resolveGrid(google, input.file_id, input.range)
        if (!gr) return { error: `no encontré la pestaña del rango "${input.range}"` }
        const base = hexToColor(input.color) || hexToColor('#6d9eeb')
        const claro = { red: Math.min(1, base.red + 0.28), green: Math.min(1, base.green + 0.28), blue: Math.min(1, base.blue + 0.28) }
        await google.spreadsheetBatchUpdate(input.file_id, [{
          addBanding: { bandedRange: { range: gr, rowProperties: {
            headerColor: base,
            firstBandColor: { red: 1, green: 1, blue: 1 },
            secondBandColor: claro,
          } } },
        }])
        return { ok: true, tabla: input.range }
      },
    },
    'drive.chart': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_add_chart',
        description: 'Inserta un GRÁFICO en una pestaña a partir de un rango de datos. La PRIMERA columna del rango es el eje (categorías) y las demás son las series. Pasá file_id, datos (rango A1 con pestaña, incluí encabezados), tipo ("columna"/"barra"/"linea"/"area"/"torta"), titulo, y opcional celda_ancla (dónde apoyar el gráfico, ej. "H2"). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            datos: { type: 'string', description: 'rango A1 con pestaña, ej. "Panel!A3:C15"' },
            tipo: { type: 'string', enum: ['columna', 'barra', 'linea', 'area', 'torta'] },
            titulo: { type: 'string' },
            celda_ancla: { type: 'string', description: 'celda donde apoyar el gráfico, ej. "H2" (misma pestaña)' },
          },
          required: ['file_id', 'datos'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.datos) return { error: 'faltan file_id o datos (rango)' }
        const { meta, gr } = await resolveGrid(google, input.file_id, input.datos)
        if (!gr || gr.startColumnIndex == null || gr.startRowIndex == null) return { error: `rango de datos inválido: "${input.datos}" (usá algo como "Hoja!A3:C15")` }
        const src = (c1, c2) => ({ sourceRange: { sources: [{ sheetId: gr.sheetId, startRowIndex: gr.startRowIndex, endRowIndex: gr.endRowIndex, startColumnIndex: c1, endColumnIndex: c2 }] } })
        const ancla = input.celda_ancla ? a1ToGridRange(meta, input.celda_ancla, (meta.find((m) => m.sheetId === gr.sheetId) || {}).title) : null
        const anchorCell = { sheetId: gr.sheetId, rowIndex: ancla?.startRowIndex ?? gr.startRowIndex, columnIndex: ancla?.startColumnIndex ?? gr.endColumnIndex + 1 }
        const tipo = String(input.tipo || 'columna').toLowerCase()
        let spec
        if (tipo === 'torta') {
          spec = { title: input.titulo || '', pieChart: { legendPosition: 'RIGHT_LEGEND', domain: src(gr.startColumnIndex, gr.startColumnIndex + 1), series: src(gr.startColumnIndex + 1, gr.startColumnIndex + 2) } }
        } else {
          const chartType = CHART_TIPO[tipo] || 'COLUMN'
          // En un gráfico de BARRAS (horizontal) el eje de valores es el de ABAJO; en columnas/
          // línea/área es el de la IZQUIERDA. Apuntar al eje equivocado = 400 "Bar charts series
          // may only target the BOTTOM_AXIS" (reclamo real del dueño). Se elige según el tipo.
          const valueAxis = chartType === 'BAR' ? 'BOTTOM_AXIS' : 'LEFT_AXIS'
          const series = []
          for (let c = gr.startColumnIndex + 1; c < gr.endColumnIndex; c++) series.push({ series: src(c, c + 1), targetAxis: valueAxis })
          spec = { title: input.titulo || '', basicChart: {
            chartType, legendPosition: 'BOTTOM_LEGEND', headerCount: 1,
            axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
            domains: [{ domain: src(gr.startColumnIndex, gr.startColumnIndex + 1) }],
            series,
          } }
        }
        await google.spreadsheetBatchUpdate(input.file_id, [{ addChart: { chart: { spec, position: { overlayPosition: { anchorCell } } } } }])
        return { ok: true, grafico: input.titulo || tipo, datos: input.datos }
      },
    },
    'drive.imagecell': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_insert_image',
        description: 'Inserta una IMAGEN dentro de una celda de un Google Sheet (vía fórmula =IMAGE, la imagen se ve dentro de la celda y se ajusta). Pasá file_id, celda (ej. "Hoja!B2") y url (link público de la imagen). Para un logo o una foto de referencia. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, celda: { type: 'string' }, url: { type: 'string' } }, required: ['file_id', 'celda', 'url'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.celda || !input?.url) return { error: 'faltan file_id, celda o url' }
        if (!/^https?:\/\//i.test(input.url)) return { error: 'la url de la imagen debe ser un link público http(s)' }
        await google.updateSheetValues(input.file_id, input.celda, [[`=IMAGE("${String(input.url).replace(/"/g, '')}")`]])
        return { ok: true, celda: input.celda, imagen: input.url }
      },
    },
    'drive.pivot': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_add_pivot',
        description:
          'Crea una TABLA DINÁMICA (pivot) en un Google Sheet: agrupa un rango de datos por una o más columnas y resume otras (suma/cuenta/promedio…). Ej: de la pestaña Compras, gasto TOTAL por Proveedor y por Mes. Pasá file_id, datos (rango A1 con pestaña, INCLUÍ la fila de encabezados, ej. "Compras!A3:N500"), destino (celda A1 con pestaña donde poner la pivot, ej. "Resumen!B3" — si la pestaña no existe la creo), filas (columnas por las que agrupar en filas — por NOMBRE de encabezado o letra), opcional columnas (agrupar en columnas) y valores (qué resumir: lista de { columna, funcion }, funcion ∈ suma/cuenta/promedio/max/min/cuenta_unica). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            datos: { type: 'string', description: 'rango fuente con pestaña e incluyendo encabezados, ej. "Compras!A3:N500"' },
            destino: { type: 'string', description: 'celda ancla con pestaña, ej. "Resumen!B3"' },
            filas: { type: 'array', items: { type: 'string' }, description: 'columnas a agrupar en filas (nombre de encabezado o letra)' },
            columnas: { type: 'array', items: { type: 'string' } },
            valores: { type: 'array', items: { type: 'object', properties: { columna: { type: 'string' }, funcion: { type: 'string', enum: ['suma', 'cuenta', 'promedio', 'max', 'min', 'cuenta_unica'] } } } },
          },
          required: ['file_id', 'datos', 'destino', 'filas', 'valores'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.datos || !input?.destino) return { error: 'faltan file_id, datos o destino' }
        const meta0 = await google.getSheetMeta(input.file_id)
        const src = a1ToGridRange(meta0, input.datos)
        if (!src || src.startColumnIndex == null || src.startRowIndex == null) return { error: `rango de datos inválido: "${input.datos}"` }
        // Encabezados de la fuente para mapear NOMBRE → offset (0-based desde la col inicial).
        const headerRow = (await google.readSheetValues(input.file_id, input.datos))[0] || []
        const FN = { suma: 'SUM', cuenta: 'COUNTA', promedio: 'AVERAGE', max: 'MAX', min: 'MIN', cuenta_unica: 'COUNTUNIQUE' }
        const offsetDe = (id) => {
          const s = String(id || '').trim()
          const i = headerRow.findIndex((h) => String(h).trim().toLowerCase() === s.toLowerCase())
          if (i >= 0) return i
          if (/^[A-Za-z]{1,3}$/.test(s)) return colToIdx(s) - src.startColumnIndex
          return null
        }
        const mapGroup = (arr) => (arr || []).map((id) => { const o = offsetDe(id); return o == null ? null : { sourceColumnOffset: o, showTotals: true, sortOrder: 'ASCENDING' } }).filter(Boolean)
        const rows = mapGroup(input.filas)
        const columns = mapGroup(input.columnas)
        const values = (input.valores || []).map((v) => { const o = offsetDe(v.columna); return o == null ? null : { summarizeFunction: FN[v.funcion] || 'SUM', sourceColumnOffset: o } }).filter(Boolean)
        if (!rows.length || !values.length) return { error: 'no pude mapear las columnas de filas/valores a la fuente (revisá los nombres de encabezado)' }
        // Destino: crear la pestaña si no existe; resolver la celda ancla.
        const bang = input.destino.lastIndexOf('!')
        const destTab = bang >= 0 ? input.destino.slice(0, bang).replace(/^'|'$/g, '') : null
        let meta = meta0
        if (destTab && !meta.find((m) => m.title === destTab)) {
          await google.spreadsheetBatchUpdate(input.file_id, [{ addSheet: { properties: { title: destTab } } }])
          meta = await google.getSheetMeta(input.file_id)
        }
        const anchor = a1ToGridRange(meta, input.destino)
        if (!anchor) return { error: `destino inválido: "${input.destino}"` }
        await google.spreadsheetBatchUpdate(input.file_id, [{
          updateCells: {
            rows: [{ values: [{ pivotTable: { source: src, rows, columns, values, valueLayout: 'HORIZONTAL' } }] }],
            start: { sheetId: anchor.sheetId, rowIndex: anchor.startRowIndex ?? 0, columnIndex: anchor.startColumnIndex ?? 0 },
            fields: 'pivotTable',
          },
        }])
        return { ok: true, pivot: input.destino, agrupado_por: input.filas, resume: (input.valores || []).map((v) => `${v.funcion} de ${v.columna}`) }
      },
    },
  }
}
