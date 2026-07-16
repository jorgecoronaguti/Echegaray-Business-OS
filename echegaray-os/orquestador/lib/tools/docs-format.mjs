// SUPERPODERES de Google Docs para el chat del OS: además de escribir texto (drive_write_doc),
// estas tools dan FORMATO (negrita, títulos, color, alineación), reemplazan texto, insertan
// IMÁGENES y TABLAS con datos — vía la Docs API (documents:batchUpdate). Capability 'drive.write'.
//
// Docs es por ÍNDICES de carácter (a diferencia de Sheets, que es por A1). Para que el modelo
// NO tenga que calcular índices (causa #1 de error), las tools que necesitan una posición la
// resuelven por dentro: el modelo dice QUÉ TEXTO tocar y la tool encuentra su rango leyendo el
// documento (getDoc). Cada tool cerrada sobre el cliente Google con WRITE_SCOPES.

/** Aplana el doc a runs de texto con su índice REAL en el documento. Devuelve
 *  [{ docStart, text }] en orden. Cada run es un textRun de un párrafo. */
function runsDelDoc(doc) {
  const runs = []
  for (const el of doc?.body?.content || []) {
    for (const pe of el?.paragraph?.elements || []) {
      if (pe?.textRun?.content != null && pe.startIndex != null) runs.push({ docStart: pe.startIndex, text: pe.textRun.content })
    }
  }
  return runs
}

/** Encuentra rangos {startIndex, endIndex} donde aparece `needle` DENTRO de un run (caso
 *  normal: un título o palabra vive en un solo textRun). `todas`=false → solo el primero. */
export function buscarRangos(doc, needle, todas = false) {
  const out = []
  const n = String(needle || '')
  if (!n) return out
  for (const r of runsDelDoc(doc)) {
    let from = 0
    let i
    while ((i = r.text.indexOf(n, from)) !== -1) {
      const start = r.docStart + i
      out.push({ startIndex: start, endIndex: start + n.length })
      if (!todas) return out
      from = i + n.length
    }
  }
  return out
}

/** Índice de inserción al FINAL del cuerpo del doc (antes del salto final). */
function finDelDoc(doc) {
  const c = doc?.body?.content || []
  const end = c.length ? (c[c.length - 1].endIndex || 1) : 1
  return Math.max(1, end - 1)
}

function hexToColorDocs(hex) {
  if (!hex) return null
  const nombres = { blanco: 'ffffff', negro: '000000', rojo: 'cc0000', verde: '38761d', azul: '1155cc', gris: '666666', naranja: 'e69138', amarillo: 'f1c232' }
  let h = String(hex).trim().toLowerCase().replace(/^#/, '')
  if (nombres[h]) h = nombres[h]
  if (!/^[0-9a-f]{6}$/.test(h)) return null
  return { color: { rgbColor: { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 } } }
}

const ESTILO_PARRAFO = { titulo: 'TITLE', título: 'TITLE', subtitulo: 'SUBTITLE', subtítulo: 'SUBTITLE', titulo1: 'HEADING_1', titulo2: 'HEADING_2', titulo3: 'HEADING_3', encabezado1: 'HEADING_1', encabezado2: 'HEADING_2', encabezado3: 'HEADING_3', normal: 'NORMAL_TEXT' }
const ALINEACION = { izquierda: 'START', centro: 'CENTER', centrado: 'CENTER', derecha: 'END', justificado: 'JUSTIFIED' }

export function docsFormatTools(google) {
  if (!google) return {}
  return {
    'drive.docreplace': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_doc_replace_text',
        description: 'Reemplaza TODAS las apariciones de un texto por otro en un Google Doc (ideal para completar plantillas: [CLIENTE] → "Arcor", [FECHA] → "16/07/2026"). Pasá file_id, buscar y reemplazar. Opcional coincidir_mayusculas. REQUIERE aprobación.',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, buscar: { type: 'string' }, reemplazar: { type: 'string' }, coincidir_mayusculas: { type: 'boolean' } }, required: ['file_id', 'buscar', 'reemplazar'] },
      },
      async run(input) {
        if (!input?.file_id || input?.buscar == null || input?.reemplazar == null) return { error: 'faltan file_id, buscar o reemplazar' }
        const r = await google.docsBatchUpdate(input.file_id, [{ replaceAllText: { containsText: { text: String(input.buscar), matchCase: !!input.coincidir_mayusculas }, replaceText: String(input.reemplazar) } }])
        const cambios = r?.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0
        return { ok: true, reemplazos: cambios, buscar: input.buscar }
      },
    },
    'drive.docstyle': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_doc_style_text',
        description: 'Da FORMATO a un texto DENTRO de un Google Doc: convertí una línea en título/subtítulo/encabezado, ponela en negrita/itálica/subrayado, cambiá tamaño o color de letra, o alineá el párrafo. NO necesitás índices: pasás el TEXTO a formatear y la tool lo encuentra. Pasá file_id, texto (el texto exacto a formatear) y las opciones. Por defecto formatea la PRIMERA aparición (todas:true para todas). REQUIERE aprobación.',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string' },
            texto: { type: 'string', description: 'texto exacto a encontrar y formatear' },
            estilo: { type: 'string', enum: ['titulo', 'subtitulo', 'titulo1', 'titulo2', 'titulo3', 'normal'], description: 'estilo de párrafo (título/encabezado)' },
            negrita: { type: 'boolean' }, italica: { type: 'boolean' }, subrayado: { type: 'boolean' },
            tamano_letra: { type: 'number' }, color_letra: { type: 'string', description: 'hex o nombre' },
            alineacion: { type: 'string', enum: ['izquierda', 'centro', 'derecha', 'justificado'] },
            todas: { type: 'boolean' },
          },
          required: ['file_id', 'texto'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.texto) return { error: 'faltan file_id o texto' }
        const doc = await google.getDoc(input.file_id)
        const rangos = buscarRangos(doc, input.texto, !!input.todas)
        if (!rangos.length) return { error: `no encontré el texto "${String(input.texto).slice(0, 40)}" en el documento` }
        const requests = []
        for (const range of rangos) {
          const ts = {}
          const fields = []
          if (input.negrita != null) { ts.bold = !!input.negrita; fields.push('bold') }
          if (input.italica != null) { ts.italic = !!input.italica; fields.push('italic') }
          if (input.subrayado != null) { ts.underline = !!input.subrayado; fields.push('underline') }
          if (input.tamano_letra) { ts.fontSize = { magnitude: Number(input.tamano_letra), unit: 'PT' }; fields.push('fontSize') }
          if (input.color_letra) { const c = hexToColorDocs(input.color_letra); if (c) { ts.foregroundColor = c; fields.push('foregroundColor') } }
          if (fields.length) requests.push({ updateTextStyle: { range, textStyle: ts, fields: fields.join(',') } })
          const ps = {}
          const pf = []
          if (input.estilo && ESTILO_PARRAFO[input.estilo]) { ps.namedStyleType = ESTILO_PARRAFO[input.estilo]; pf.push('namedStyleType') }
          if (input.alineacion && ALINEACION[input.alineacion]) { ps.alignment = ALINEACION[input.alineacion]; pf.push('alignment') }
          if (pf.length) requests.push({ updateParagraphStyle: { range, paragraphStyle: ps, fields: pf.join(',') } })
        }
        if (!requests.length) return { error: 'no indicaste ningún formato (negrita, estilo, color, alineación…)' }
        await google.docsBatchUpdate(input.file_id, requests)
        return { ok: true, texto: input.texto, aplicado_en: rangos.length }
      },
    },
    'drive.docimage': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_doc_insert_image',
        description: 'Inserta una IMAGEN en un Google Doc desde una URL pública. Por defecto al FINAL del documento; con despues_de podés insertarla justo después de un texto dado. Pasá file_id, url y opcional despues_de. REQUIERE aprobación.',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, url: { type: 'string' }, despues_de: { type: 'string', description: 'texto tras el cual insertar (si no, va al final)' } }, required: ['file_id', 'url'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.url) return { error: 'faltan file_id o url' }
        if (!/^https?:\/\//i.test(input.url)) return { error: 'la url de la imagen debe ser un link público http(s)' }
        const doc = await google.getDoc(input.file_id)
        let index = finDelDoc(doc)
        if (input.despues_de) { const r = buscarRangos(doc, input.despues_de, false); if (r.length) index = r[0].endIndex }
        await google.docsBatchUpdate(input.file_id, [{ insertInlineImage: { location: { index }, uri: input.url } }])
        return { ok: true, imagen: input.url, index }
      },
    },
    'drive.doctable': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_doc_insert_table',
        description: 'Inserta una TABLA con datos al final de un Google Doc. Pasá file_id y datos = matriz de filas (la primera fila suele ser el encabezado). Ej. datos = [["Obra","Costo"],["Estrella","$1.000"],["Messina","$2.500"]]. REQUIERE aprobación.',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, datos: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['file_id', 'datos'] },
      },
      async run(input) {
        if (!input?.file_id || !Array.isArray(input?.datos) || !input.datos.length) return { error: 'faltan file_id o datos (matriz de filas)' }
        const filas = input.datos.map((f) => (Array.isArray(f) ? f : [f]))
        const cols = Math.max(...filas.map((f) => f.length))
        const doc = await google.getDoc(input.file_id)
        const at = finDelDoc(doc)
        // 1) insertar la tabla vacía al final.
        await google.docsBatchUpdate(input.file_id, [{ insertTable: { rows: filas.length, columns: cols, location: { index: at } } }])
        // 2) releer, ubicar la tabla recién insertada (la última) y sus celdas.
        const doc2 = await google.getDoc(input.file_id)
        const tablas = (doc2.body?.content || []).filter((e) => e.table)
        const tabla = tablas[tablas.length - 1]
        if (!tabla) return { ok: true, tabla: `${filas.length}x${cols}`, nota: 'tabla creada (no pude rellenar automáticamente)' }
        // 3) juntar (índice, texto) de cada celda y rellenar de MAYOR a MENOR índice (así las
        //    inserciones previas no corren los índices de las siguientes).
        const inserts = []
        const rows = tabla.table.tableRows || []
        for (let r = 0; r < rows.length && r < filas.length; r++) {
          const celdas = rows[r].tableCells || []
          for (let c = 0; c < celdas.length && c < filas[r].length; c++) {
            const texto = String(filas[r][c] ?? '')
            if (!texto) continue
            const parr = celdas[c].content?.find((x) => x.paragraph)
            const idx = parr?.startIndex
            if (idx != null) inserts.push({ index: idx, texto })
          }
        }
        inserts.sort((a, b) => b.index - a.index)
        if (inserts.length) await google.docsBatchUpdate(input.file_id, inserts.map((x) => ({ insertText: { location: { index: x.index }, text: x.texto } })))
        return { ok: true, tabla: `${filas.length}x${cols}`, celdas_rellenadas: inserts.length }
      },
    },
  }
}
