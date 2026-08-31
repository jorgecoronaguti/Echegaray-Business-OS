// GOOGLE, DEL OTRO LADO DEL CABLE. Un `fetch` que responde como Sheets y Drive.
//
// ═══ POR QUÉ EL DOBLE VA EN EL FETCH Y NO EN EL CLIENTE ═══
//
// Lo obvio sería fabricar un objeto con `readSheetValues`, `updateSheetValues`, etc. y pasárselo al
// motor. Sería mucho más corto y no probaría casi nada: se saltearía TODO `google.mjs`, que es
// justamente donde vive lo que más se rompe — la construcción de la URL y el escapado del rango, la
// localización de fórmulas a es-AR (`;` separador, `,` decimal), el freno de mano, la guarda de
// escritura, el cinturón de no-borrar, y el `valueRenderOption` que decide si una fecha vuelve como
// serial o como texto ambiguo.
//
// Poniendo el doble en `fetchImpl`, el cliente REAL corre entero y lo único fingido es el servidor
// de Google. `makeGoogleClient` ya acepta `fetchImpl` y `auth`, así que tampoco hacen falta
// credenciales: es un punto de inyección que ya existía, no uno que se agregó para el test.
//
// ═══ LO QUE ESTE DOBLE NO ES ═══
//
// No es un emulador de Google Sheets. No hay formato condicional, ni gráficos, ni tablas dinámicas,
// ni protecciones, ni derrame de fórmulas matriciales. Sirve para probar el motor, y donde el motor
// dependa de algo de eso, la prueba tiene que ser contra Google. Está dicho acá para que nadie
// interprete un verde de este doble como un verde de producción.

import { evaluar } from './calculo-falso.mjs'

const MIME_SHEET = 'application/vnd.google-apps.spreadsheet'
const clave = (f, c) => `${f},${c}`

/** El estado del "Drive" falso: archivos, hojas, celdas, rangos con nombre. */
export function crearDrive({ locale = 'es_AR' } = {}) {
  const archivos = new Map()
  let seq = 0

  const nuevoArchivo = ({ name, mimeType = MIME_SHEET, hojas = ['Hoja 1'] }) => {
    const id = `fake-${++seq}-${Math.random().toString(36).slice(2, 8)}`
    archivos.set(id, {
      id,
      name,
      mimeType,
      trashed: false,
      locale,
      version: 1,
      hojas: hojas.map((t, i) => ({ sheetId: 1000 + i, title: t, index: i, hidden: false, celdas: new Map() })),
      namedRanges: [],
      nextSheetId: 1000 + hojas.length,
    })
    return archivos.get(id)
  }

  return {
    archivos,
    nuevoArchivo,
    /** Las llamadas que efectivamente llegaron. Es lo que permite AFIRMAR que una operación no
     *  hizo I/O de más, y contar cuántas veces se releyó. */
    trafico: [],
  }
}

/** Busca la hoja por título dentro de un archivo. */
const hojaDe = (arch, titulo) => arch.hojas.find((h) => h.title === titulo)

/** "'Panel Caja'!A1:C3" → { titulo, a:{f,c}, b:{f,c} }. Parser propio del doble a propósito: si
 *  usara el del motor, un bug de parseo se cancelaría contra sí mismo y el test daría verde. */
function partirRango(ref, arch) {
  const s = String(ref)
  let titulo = null
  let cuerpo = s
  const bang = s.lastIndexOf('!')
  if (bang >= 0) {
    titulo = s.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'")
    cuerpo = s.slice(bang + 1)
  }
  const hoja = titulo ? hojaDe(arch, titulo) : arch.hojas[0]
  if (!hoja) return { hoja: null, titulo }
  const col = (l) => { let n = 0; for (const c of l.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1 }
  const m = /^\$?([A-Za-z]+)\$?([0-9]+)(?::\$?([A-Za-z]+)\$?([0-9]+))?$/.exec(cuerpo)
  if (!m) return { hoja, titulo: hoja.title, a: { f: 0, c: 0 }, b: { f: 999, c: 25 }, aproximado: true }
  const a = { f: Number(m[2]) - 1, c: col(m[1]) }
  const b = m[3] ? { f: Number(m[4]) - 1, c: col(m[3]) } : { ...a }
  return { hoja, titulo: hoja.title, a, b }
}

/** El valor CALCULADO de una celda: si tiene fórmula, se evalúa; si no, es lo que hay. */
function valorDe(arch, hoja, f, c, profundidad = 0) {
  const celda = hoja?.celdas.get(clave(f, c))
  if (!celda) return null
  if (celda.formula === undefined || celda.formula === null) return celda.valor ?? null
  if (profundidad > 20) return '#REF!' // una referencia circular no cuelga el doble
  const leer = (titulo, ff, cc) => {
    const h = titulo ? hojaDe(arch, titulo) : hoja
    if (!h) return '#REF!' // hoja inexistente en una fórmula: el error que Sheets devuelve
    return valorDe(arch, h, ff, cc, profundidad + 1)
  }
  return evaluar(celda.formula, leer, hoja.title)
}

/** Escribe una celda distinguiendo fórmula de literal — la misma distinción que hace USER_ENTERED. */
function ponerCelda(hoja, f, c, v) {
  if (v === '' || v === null || v === undefined) { hoja.celdas.delete(clave(f, c)); return }
  if (typeof v === 'string' && v.startsWith('=')) { hoja.celdas.set(clave(f, c), { formula: v }); return }
  hoja.celdas.set(clave(f, c), { valor: v })
}

/** Última fila con algo en la hoja (base 0), o -1. Para que `append` aterrice donde aterrizaría. */
function ultimaFila(hoja) {
  let max = -1
  for (const k of hoja.celdas.keys()) max = Math.max(max, Number(k.split(',')[0]))
  return max
}

const json = (obj, status = 200) => ({
  ok: status < 300,
  status,
  headers: { get: () => null },
  json: async () => obj,
  text: async () => JSON.stringify(obj),
})

const error = (status, mensaje) => json({ error: { code: status, message: mensaje } }, status)

/**
 * El `fetchImpl` para `makeGoogleClient`. Cubre exactamente los endpoints que el motor usa.
 * Cualquier otro devuelve 404 a propósito: un doble que responde `{}` a lo que no conoce hace pasar
 * tests sobre código que en producción se rompería.
 */
export function fetchFalso(drive) {
  return async function fetchImpl(url, opciones = {}) {
    const u = new URL(String(url))
    const metodo = (opciones.method || 'GET').toUpperCase()
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : null
    drive.trafico.push({ metodo, url: u.pathname + u.search })

    if (u.hostname === 'sheets.googleapis.com') return sheets(drive, u, metodo, cuerpo)
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files')) {
      return driveApi(drive, u, metodo, cuerpo)
    }
    return error(404, `el doble no conoce ${u.hostname}${u.pathname}`)
  }
}

// ─────────────────────────────── Sheets API ───────────────────────────────

function sheets(drive, u, metodo, cuerpo) {
  const m = /^\/v4\/spreadsheets\/([^/:]+)(?::(\w+))?(?:\/values\/([^:]+))?(?::(\w+))?$/.exec(u.pathname)
  if (!m) return error(404, `ruta de sheets desconocida: ${u.pathname}`)
  const arch = drive.archivos.get(decodeURIComponent(m[1]))
  if (!arch || arch.trashed) return error(404, 'Requested entity was not found.')

  if (m[3]) return valores(arch, decodeURIComponent(m[3]), u, metodo, cuerpo, m[4])
  if (m[2] === 'batchUpdate') return batchUpdate(arch, cuerpo)
  if (metodo === 'GET') return metadatos(arch, u)
  return error(400, 'operación no soportada por el doble')
}

/** GET spreadsheets/{id} con `fields`. Se responde según lo que el `fields` pide, como hace Google. */
function metadatos(arch, u) {
  const fields = u.searchParams.get('fields') || ''
  const salida = {}
  if (fields.includes('properties.locale')) salida.properties = { locale: arch.locale }
  if (fields.includes('namedRanges')) salida.namedRanges = arch.namedRanges
  if (fields.includes('sheets')) {
    // Google devuelve SOLO las hojas alcanzadas por `ranges`, no todas. Imitarlo importa: el motor
    // toma `sheets[0]` dando por hecho ese filtro, y un doble que devolviera todas haría pasar un
    // test que en producción leería la hoja equivocada.
    const pedido = u.searchParams.getAll('ranges')
    const titulos = pedido.length
      ? new Set(pedido.map((r) => partirRango(r, arch).titulo).filter(Boolean))
      : null
    salida.sheets = arch.hojas.filter((h) => !titulos || titulos.has(h.title)).map((h) => ({
      properties: {
        sheetId: h.sheetId,
        title: h.title,
        index: h.index,
        ...(h.hidden ? { hidden: true } : {}), // la API OMITE hidden cuando es falso: se imita
        gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 0, frozenColumnCount: 0 },
      },
      ...(fields.includes('data(') || fields.includes('includeGridData') ? { data: [gridDe(arch, u)] } : {}),
    }))
  }
  return json(salida)
}

/** La grilla cruda de un rango, con `userEnteredValue`/`effectiveValue` — lo que lee `readSheetGrid`. */
function gridDe(arch, u) {
  const ref = u.searchParams.get('ranges')
  if (!ref) return {}
  const r = partirRango(ref, arch)
  if (!r.hoja) return {}
  const rowData = []
  for (let f = r.a.f; f <= r.b.f; f++) {
    const values = []
    for (let c = r.a.c; c <= r.b.c; c++) {
      const celda = r.hoja.celdas.get(clave(f, c))
      const v = valorDe(arch, r.hoja, f, c)
      values.push({
        ...(celda?.formula ? { userEnteredValue: { formulaValue: celda.formula } }
          : celda ? { userEnteredValue: typeof celda.valor === 'number' ? { numberValue: celda.valor } : { stringValue: String(celda.valor) } }
            : {}),
        ...(v === null ? {} : { effectiveValue: typeof v === 'number' ? { numberValue: v } : { stringValue: String(v) }, formattedValue: String(v) }),
      })
    }
    rowData.push({ values })
  }
  return { startRow: r.a.f, startColumn: r.a.c, rowData }
}

/** values.get / values.update / values.append */
function valores(arch, ref, u, metodo, cuerpo, sufijo) {
  const r = partirRango(ref, arch)
  if (!r.hoja) return error(400, `Unable to parse range: ${ref}`)

  if (metodo === 'GET') {
    const render = u.searchParams.get('valueRenderOption') || 'FORMATTED_VALUE'
    const values = []
    for (let f = r.a.f; f <= r.b.f; f++) {
      const fila = []
      for (let c = r.a.c; c <= r.b.c; c++) {
        const celda = r.hoja.celdas.get(clave(f, c))
        if (render === 'FORMULA' && celda?.formula) { fila.push(celda.formula); continue }
        const v = valorDe(arch, r.hoja, f, c)
        fila.push(v === null ? '' : (render === 'UNFORMATTED_VALUE' ? v : String(v)))
      }
      values.push(fila)
    }
    // Google RECORTA las filas y columnas vacías del final. Imitarlo es esencial: es la causa de
    // que un llamador crea que la tabla es más corta de lo que pidió.
    while (values.length && values.at(-1).every((v) => v === '')) values.pop()
    for (const fila of values) while (fila.length && fila.at(-1) === '') fila.pop()
    return json({ range: ref, majorDimension: 'ROWS', values })
  }

  if (metodo === 'PUT') {
    const filas = cuerpo?.values ?? []
    for (let f = 0; f < filas.length; f++) {
      for (let c = 0; c < (filas[f] ?? []).length; c++) ponerCelda(r.hoja, r.a.f + f, r.a.c + c, filas[f][c])
    }
    arch.version++
    return json({ spreadsheetId: arch.id, updatedRange: ref, updatedRows: filas.length, updatedCells: filas.flat().length })
  }

  if (metodo === 'POST' && sufijo === 'append') {
    const filas = cuerpo?.values ?? []
    const desde = ultimaFila(r.hoja) + 1
    for (let f = 0; f < filas.length; f++) {
      for (let c = 0; c < (filas[f] ?? []).length; c++) ponerCelda(r.hoja, desde + f, r.a.c + c, filas[f][c])
    }
    arch.version++
    const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
    const ancho = Math.max(...filas.map((x) => (x ?? []).length), 1)
    const cita = /[^A-Za-z0-9_]/.test(r.hoja.title) ? `'${r.hoja.title}'` : r.hoja.title
    const rango = `${cita}!${letra(r.a.c)}${desde + 1}:${letra(r.a.c + ancho - 1)}${desde + filas.length}`
    return json({ spreadsheetId: arch.id, updates: { updatedRange: rango, updatedRows: filas.length } })
  }
  return error(400, `values: método ${metodo} no soportado por el doble`)
}

/** spreadsheets.batchUpdate — las operaciones de FORMA. */
function batchUpdate(arch, cuerpo) {
  const replies = []
  for (const req of cuerpo?.requests ?? []) {
    if (req.updateSpreadsheetProperties) {
      Object.assign(arch, { locale: req.updateSpreadsheetProperties.properties?.locale ?? arch.locale })
      replies.push({}); continue
    }
    if (req.addSheet) {
      const t = req.addSheet.properties?.title
      if (arch.hojas.some((h) => h.title === t)) return error(400, `A sheet with the name "${t}" already exists.`)
      const h = { sheetId: arch.nextSheetId++, title: t, index: arch.hojas.length, hidden: false, celdas: new Map() }
      arch.hojas.push(h)
      replies.push({ addSheet: { properties: { sheetId: h.sheetId, title: h.title, index: h.index } } }); continue
    }
    if (req.duplicateSheet) {
      const src = arch.hojas.find((h) => h.sheetId === req.duplicateSheet.sourceSheetId)
      if (!src) return error(400, 'sourceSheetId no existe')
      const t = req.duplicateSheet.newSheetName
      if (arch.hojas.some((h) => h.title === t)) return error(400, `A sheet with the name "${t}" already exists.`)
      // La copia lleva el CONTENIDO, incluidas las fórmulas: es lo que distingue `duplicateSheet`
      // de un leer-y-reescribir, y es justo lo que el motor promete al copiar una hoja.
      const h = { sheetId: arch.nextSheetId++, title: t, index: arch.hojas.length, hidden: false, celdas: new Map(src.celdas) }
      arch.hojas.push(h)
      replies.push({ duplicateSheet: { properties: { sheetId: h.sheetId, title: t } } }); continue
    }
    if (req.deleteSheet) {
      const i = arch.hojas.findIndex((h) => h.sheetId === req.deleteSheet.sheetId)
      if (i < 0) return error(400, 'sheetId no existe')
      arch.hojas.splice(i, 1)
      replies.push({}); continue
    }
    if (req.addNamedRange) {
      const nr = req.addNamedRange.namedRange
      arch.namedRanges.push({ namedRangeId: `nr-${arch.namedRanges.length + 1}`, name: nr.name, range: nr.range })
      replies.push({ addNamedRange: { namedRange: arch.namedRanges.at(-1) } }); continue
    }
    if (req.updateNamedRange) {
      const nr = req.updateNamedRange.namedRange
      const i = arch.namedRanges.findIndex((x) => x.namedRangeId === nr.namedRangeId)
      if (i < 0) return error(400, 'namedRangeId no existe')
      arch.namedRanges[i] = { ...arch.namedRanges[i], name: nr.name, range: nr.range }
      replies.push({}); continue
    }
    replies.push({}) // request que el doble ignora (formato, anchos): no falla, pero tampoco finge
  }
  arch.version++
  return json({ spreadsheetId: arch.id, replies })
}

// ─────────────────────────────── Drive API ───────────────────────────────

function driveApi(drive, u, metodo, cuerpo) {
  const m = /^\/drive\/v3\/files(?:\/([^/]+))?(?:\/(copy))?$/.exec(u.pathname)
  if (!m) return error(404, `ruta de drive desconocida: ${u.pathname}`)

  if (!m[1] && metodo === 'POST') {
    const a = drive.nuevoArchivo({ name: cuerpo?.name, mimeType: cuerpo?.mimeType })
    return json({ id: a.id, name: a.name, mimeType: a.mimeType, webViewLink: `https://fake/${a.id}` })
  }
  const arch = drive.archivos.get(decodeURIComponent(m[1] ?? ''))
  if (!arch) return error(404, 'File not found.')

  if (m[2] === 'copy' && metodo === 'POST') {
    const c = drive.nuevoArchivo({ name: cuerpo?.name ?? `Copia de ${arch.name}`, mimeType: arch.mimeType, hojas: [] })
    c.hojas = arch.hojas.map((h) => ({ ...h, celdas: new Map(h.celdas) }))
    c.nextSheetId = arch.nextSheetId
    c.namedRanges = arch.namedRanges.map((n) => ({ ...n }))
    return json({ id: c.id, name: c.name, mimeType: c.mimeType, webViewLink: `https://fake/${c.id}` })
  }
  if (metodo === 'GET') {
    if (arch.trashed) return json({ id: arch.id, name: arch.name, mimeType: arch.mimeType, trashed: true })
    return json({ id: arch.id, name: arch.name, mimeType: arch.mimeType, trashed: false, version: String(arch.version), webViewLink: `https://fake/${arch.id}` })
  }
  if (metodo === 'PATCH') {
    Object.assign(arch, cuerpo ?? {})
    return json({ id: arch.id, name: arch.name, trashed: !!arch.trashed })
  }
  return error(400, `drive: método ${metodo} no soportado por el doble`)
}
