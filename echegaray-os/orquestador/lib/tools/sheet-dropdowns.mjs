// Lee los DESPLEGABLES (validación de datos tipo lista) de una pestaña de Google Sheets.
// Por qué existe: muchas columnas de negocio (Proveedor, Categoría, Unidad, Modalidad, Tipo)
// tienen un desplegable con opciones precargadas. Si el OS carga un dato tipeando texto libre
// (ej. "HORMISERV SRL" cuando la lista dice "Hormiserv"), ROMPE la validación y ensucia la
// planilla. Antes de cargar una fila, el modelo debe leer estas opciones y ELEGIR la que
// corresponde (match, aunque el texto de la factura no sea idéntico) — nunca inventar una nueva.
// Solo lectura (capability drive.read) → corre inline en el chat, sin aprobación.

import { a1ToGridRange } from './sheets-format.mjs'

/** Convierte índice de columna (0-based, ya con offset) a letra A1 (A, B, …, Z, AA…). */
function colToLetter(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

export function sheetDropdownTools(google) {
  return {
    // El OS sabía LEER desplegables pero no crearlos: cada columna categórica nueva quedaba como
    // texto libre, que es de donde salen "San Francisco" / "san francisco" / "S. Francisco" como
    // tres cosas distintas. Sin esto, ninguna pestaña nueva puede nacer bien.
    'sheet.crear_desplegable': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_crear_desplegable',
        description:
          'CREA un desplegable (validación de datos tipo lista) en un rango de columna de un Google ' +
          'Sheet, para que nadie escriba texto libre en una columna categórica (cliente, obra, estado, ' +
          'proveedor). Las opciones se pasan en `opciones`, o se toman de un rango con `rango_origen` ' +
          '(preferible: así la lista vive en una pestaña de parámetros y se mantiene en un solo lugar). ' +
          'Con `estricto:true` rechaza cualquier valor fuera de la lista; con false sólo avisa.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            range: { type: 'string', description: 'rango A1 con pestaña donde poner el desplegable, ej. "Jornales!A5:A80"' },
            opciones: { type: 'array', items: { type: 'string' }, description: 'lista de opciones fijas' },
            rango_origen: { type: 'string', description: 'rango A1 de donde salen las opciones, ej. "Parámetros!A45:A50"' },
            estricto: { type: 'boolean', description: 'true = rechaza lo que no esté en la lista (default true)' },
          },
          required: ['file_id', 'range'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const opciones = Array.isArray(input.opciones) ? input.opciones.filter(Boolean) : []
        if (!opciones.length && !input.rango_origen) return { error: 'pasá `opciones` o `rango_origen`' }
        try {
          const meta = await google.getSheetMeta(input.file_id)
          const rango = a1ToGridRange(meta, input.range)
          const condition = opciones.length
            ? { type: 'ONE_OF_LIST', values: opciones.map((v) => ({ userEnteredValue: String(v) })) }
            : { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: '=' + input.rango_origen }] }
          await google.spreadsheetBatchUpdate(input.file_id, [{
            setDataValidation: {
              range: rango,
              rule: { condition, showCustomUi: true, strict: input.estricto !== false },
            },
          }])
          return { ok: true, range: input.range, opciones: opciones.length || `desde ${input.rango_origen}` }
        } catch (e) {
          return { error: `no pude crear el desplegable: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },

    'sheet.desplegables': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_desplegables',
        description: 'Lee los DESPLEGABLES (validación de datos tipo lista) de una pestaña de un Google Sheet: por cada columna que tiene desplegable, devuelve la letra de columna, el encabezado y la LISTA de opciones válidas precargadas. USALO SIEMPRE ANTES de cargar/escribir una fila en una pestaña que pueda tener desplegables (ej. una pestaña de compras/gastos con Proveedor, Categoría, Unidad de Negocio, Modalidad, Tipo). REGLA: en una columna con desplegable NO escribas texto libre ni una opción nueva — elegí de la lista la opción que corresponde al dato (aunque el texto de la factura no sea idéntico: "ALVARADO MARIEL EDIT" → "Alvarado Mariel Edith", "HORMISERV SRL" → "Hormiserv", "FACTURA A" → "F A", "Contado" → "Pago", "Cta Cte" → "Cuenta Corriente"). Si NINGUNA opción encaja, NO inventes: avisá al dueño que falta esa opción en el desplegable. Pasá file_id y tab.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            tab: { type: 'string', description: 'pestaña a inspeccionar' },
            filas: { type: 'number', description: 'cuántas filas de datos inspeccionar para detectar desplegables (default 60)' },
          },
          required: ['file_id', 'tab'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id o tab' }
        const nFilas = Math.min(Math.max(Number(input.filas) || 60, 5), 300)
        try {
          const rango = `${input.tab}!1:${nFilas}`
          const [sheets, valores] = await Promise.all([
            google.readSheetValidations(input.file_id, rango),
            google.readSheetValues(input.file_id, rango).catch(() => []),
          ])
          const data = sheets?.[0]?.data?.[0]
          if (!data) return { error: `no encontré la pestaña "${input.tab}" o no tiene datos` }
          const startCol = data.startColumn || 0
          // Juntar, por columna, las opciones ONE_OF_LIST (recorre las filas: la validación puede
          // estar aplicada desde la primera fila de datos, no en el encabezado).
          const opcionesPorCol = new Map()
          for (const row of (data.rowData || [])) {
            ;(row.values || []).forEach((cell, ci) => {
              const dv = cell?.dataValidation
              if (dv?.condition?.type === 'ONE_OF_LIST') {
                const opts = (dv.condition.values || []).map((v) => v.userEnteredValue).filter((x) => x != null && x !== '')
                if (opts.length && !opcionesPorCol.has(ci)) opcionesPorCol.set(ci, opts)
              }
            })
          }
          if (!opcionesPorCol.size) return { tab: input.tab, con_desplegable: false, columnas: [], nota: 'Esta pestaña no tiene columnas con desplegable (validación de lista) en las filas inspeccionadas. Podés escribir normal.' }
          // Encabezado: entre las primeras filas, la que tenga MÁS celdas con texto en las
          // columnas de desplegable (la fila de títulos real, no una fila combinada suelta).
          const filasVal = Array.isArray(valores) ? valores : []
          const claves = [...opcionesPorCol.keys()]
          const llenas = (r) => (Array.isArray(r) ? claves.filter((ci) => r[startCol + ci] != null && String(r[startCol + ci]).trim() !== '').length : 0)
          const headerRow = filasVal.slice(0, 8).reduce((mejor, r) => (llenas(r) > llenas(mejor) ? r : mejor), filasVal[0] || [])
          const columnas = [...opcionesPorCol.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([ci, opciones]) => ({
              columna: colToLetter(startCol + ci),
              encabezado: headerRow[startCol + ci] != null ? String(headerRow[startCol + ci]).trim() : null,
              opciones,
            }))
          return {
            tab: input.tab,
            con_desplegable: true,
            columnas,
            nota: 'En estas columnas ELEGÍ una opción de la lista (la que corresponda al dato), NO escribas texto libre ni una opción nueva. Si ninguna encaja, avisá; no inventes.',
          }
        } catch (e) {
          return { error: `no pude leer los desplegables: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
