// Tools de ESCRITURA de Drive/Sheets, tipadas como CAPACIDAD. Espejo de drive.mjs
// (lectura) para el lado de escritura. Declaran capability 'drive.write' (Nivel E →
// la policy devuelve requires_approval) o 'drive.delete' (Nivel F → forbidden).
//
// CLAVE del diseño: estas tools NUNCA se ejecutan desde el motor interactivo. Cuando
// el modelo las invoca, el tool-executor consulta la policy, ve requires_approval y
// las ENCOLA en pending_operations (no llama a run). El único que llama a run() es el
// ejecutor de operaciones aprobadas (handlers/operation_execute.mjs), DESPUÉS de que
// un humano aprobó. Por eso el efecto real vive acá, en un solo lugar, reusado.

import { crearCapacidadDrive } from '../drive/index.mjs'
import { caraFina } from './drive-cara.mjs'

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

// Verificación post-escritura: si se escribieron FÓRMULAS, releemos el rango y detectamos
// celdas que quedaron en error (#ERROR!, #REF!, #N/A, …). Así el modelo SABE que NO quedó
// resuelto y no puede declarar "listo" con la planilla rota (bug real: fórmulas con coma en
// sheet es_AR daban #ERROR! y el OS decía que estaba hecho).
const CELL_ERR = /^#(ERROR|REF|N\/A|VALUE|DIV\/0|NAME|NUM|NULL)!?/i
async function verificarErrores(google, fileId, range, values) {
  const hayFormula = Array.isArray(values) && values.some((r) => Array.isArray(r) && r.some((c) => typeof c === 'string' && c[0] === '='))
  if (!hayFormula || !range) return []
  try {
    const back = await google.readSheetValues(fileId, range)
    const errs = new Set()
    for (const row of back || []) for (const c of row || []) if (typeof c === 'string' && CELL_ERR.test(c.trim())) errs.add(c.trim())
    return [...errs]
  } catch { return [] }
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

/** Google devuelve "Unable to parse range: Pestaña!A1" cuando la PESTAÑA no existe (no cuando
 *  el rango A1 está mal). El modelo, sin saber los nombres reales, reintenta a ciegas y quema
 *  iteraciones/costo (bug real del journal: "Sheet1!A1", "Cómputo!A63"). Convertimos ese 400 en
 *  un error ÚTIL: le devolvemos las pestañas reales para que corrija el nombre en UN paso barato. */
const RANGE_ERR = /Unable to parse range|Invalid data\[\d+\].*(range|parse)/i
// F4: editar un archivo OFFICE (.xlsx/.xlsm subido, no Sheet nativo) tira un 400 opaco
// ("must not be an Office file" / FAILED_PRECONDITION) y el modelo reintentaba a ciegas
// quemando iteraciones. Lo traducimos: leer sí anda, editar requiere convertir a Sheet nativo.
const OFFICE_ERR = /must not be an Office file|not supported for this document|FAILED_PRECONDITION/i
async function conPestanasSiFalla(google, fileId, fn) {
  try {
    return await fn()
  } catch (e) {
    const msg = String(e?.message || e)
    if (OFFICE_ERR.test(msg)) {
      return {
        error: 'Este archivo es un EXCEL (.xlsx/.xlsm) subido, NO un Google Sheet nativo: la API de edición no opera sobre Office. Se puede LEER (drive_read), pero para EDITARLO hay que convertirlo primero a Google Sheet nativo. Avisale al dueño y ofrecé convertirlo (o trabajar sobre una copia nativa). NO reintentes escribir sobre el Office.',
        google_error: msg.slice(0, 200),
      }
    }
    if (!RANGE_ERR.test(msg)) throw e
    let tabs = []
    try { tabs = await google.listTabs(fileId) } catch { /* si tampoco puedo listar, devuelvo el error crudo */ }
    return {
      error: 'No pude escribir: la PESTAÑA del rango no existe (o el nombre no coincide exacto). ' +
        (tabs.length
          ? 'Pestañas reales de este Sheet: ' + tabs.map((t) => `"${t}"`).join(', ') + '. Usá EXACTO uno de esos nombres (respetá acentos/mayúsculas) o creá la pestaña con drive_add_tab antes de escribir.'
          : 'No pude listar las pestañas. Verificá el file_id.'),
      google_error: msg.slice(0, 200),
    }
  }
}

/** Mensaje cuando una celda quedó en #ERROR!/#VALUE! tras escribir una fórmula. Antes solo decía
 *  "revisá el separador". Pero la causa #1 real (auditoría 18/07, caso =G62*1.02 con G62="$248.000")
 *  es que la celda REFERENCIADA es TEXTO, no número → la fórmula no puede operarla. Guiamos al
 *  modelo a la verificación BARATA (=ISNUMBER en esa celda) en vez de re-leer todo el sheet y
 *  agotar el tope de costo. Así el diagnóstico cuesta centavos, no dólares. */
function avisoErrorCeldas(errs) {
  const esValor = errs.some((e) => /#(VALUE|ERROR)/i.test(e))
  return 'OJO: NO quedó resuelto. Estas celdas dan error tras escribir: ' + errs.join(', ') + '. ' +
    'NO le digas al dueño que está listo. Causa MÁS PROBABLE: la celda que referencia la fórmula está guardada como TEXTO ' +
    '(ej. "$248.000" o "1.234,56" con símbolos), no como número — entonces no se puede multiplicar/sumar. ' +
    'Verificá BARATO con =ISNUMBER(<esa celda>) en una celda libre; si da FALSO, el problema es el DATO (normalizá esa celda a número), no tu fórmula. ' +
    (esValor ? '' : 'Si el dato SÍ es número, revisá separador/referencia/rango de la fórmula. ')
}

/** Registry de tools de escritura, cerrado sobre un cliente Google con WRITE_SCOPES. */
/**
 * Registry de tools de ESCRITURA, cerrado sobre un cliente Google.
 *
 * Desde el 31/08, las cinco que tocan el ARCHIVO —crear, renombrar, mover, copiar, papelera— no
 * implementan nada: llaman a la capacidad nativa (`lib/drive/`), que relee el destino antes de
 * afirmar el efecto y deja la operación auditada. Las que tocan el CONTENIDO de una pestaña
 * (update/append/clear/insertrows/…) siguen igual: son de los motores de contenido, no de esta
 * capacidad, y su borde no se cruza.
 *
 * `opciones` es aditivo (db/actor/correlationId) para no romperle la firma a los cuatro
 * entrypoints que ya llaman `driveWriteTools(google)`.
 */
export function driveWriteTools(google, opciones = {}) {
  // PEREZOSO, Y NO ES UN DETALLE DE ESTILO.
  //
  // `os.mjs` construye el registro ENTERO —79 capacidades— en un solo objeto, y su
  // `googleClient()` devuelve `null` cuando nadie autorizó Google (contrato documentado en
  // os.mjs:66: "las capacidades de Drive lo dicen en vez de fallar raro"). Armar la capacidad
  // acá arriba hacía que un OAuth vencido tirara abajo el registro completo: jornales, caja,
  // cobranzas, impuestos y obligaciones dejaban de existir por un problema de Drive. Medido:
  // `node orquestador/os.mjs list` pasaba de 79 capacidades a "Falló: la capacidad de Drive
  // necesita un cliente Google".
  //
  // Instanciar dentro del `run()` deja el registro intacto y mueve la falla a donde tiene que
  // estar: la tool de Drive que se invoque contesta PERMISSION_REQUIRED, y el resto anda.
  let _cap = null
  const drive = () => (_cap ??= crearCapacidadDrive({ google, ...opciones }))
  return {
    'drive.update': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_update',
        description:
          'Sobrescribe un rango de celdas de un Google Sheet EXISTENTE con valores nuevos. Usalo para corregir/completar/ordenar celdas concretas. Pasá file_id, range (A1, ej. "RESUMEN!B4:B6") y values (matriz de filas). Se aplica AL INSTANTE al llamarla (no pidas aprobación): no se ejecuta hasta que el dueño la apruebe.',
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
        return conPestanasSiFalla(google, input.file_id, async () => {
          // Escribir desde la celda inicial: Sheets dimensiona según la matriz, evitando el 400
          // "tried writing to column/row X" que hacía loopear al modelo hasta agotar iteraciones.
          // yaGuardado: es una escritura que el dueño APROBÓ (esta tool pasa por la cola de aprobación).
          // No la bloquea la guarda central — bloquear algo que el dueño pidió sería el error opuesto.
          const r = await google.updateSheetValues(input.file_id, startCell(input.range), values, { yaGuardado: true })
          const errs = await verificarErrores(google, input.file_id, r.updatedRange ?? input.range, values)
          return {
            ok: errs.length === 0, updated_range: r.updatedRange ?? input.range, updated_cells: r.updatedCells ?? null,
            ...(errs.length ? { advertencia: avisoErrorCeldas(errs), celdas_con_error: errs } : {}),
          }
        })
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
        return conPestanasSiFalla(google, input.file_id, async () => {
          const r = await google.appendSheetValues(input.file_id, input.range, values, { yaGuardado: true }) // tool aprobada por el dueño
          return { ok: true, updated_range: r.updates?.updatedRange ?? null, appended_rows: r.updates?.updatedRows ?? values.length }
        })
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
      run: caraFina(async (input) => {
        const tipo = String(input?.tipo || '').toLowerCase()
        if (!input?.name || !TIPO_MIME[tipo]) return { error: 'faltan name o tipo válido ("doc"|"sheet"|"slides"|"carpeta")' }
        // Un Doc CON contenido sigue por `createDoc`: crea e inserta el texto en un solo paso, y
        // el texto es CONTENIDO — no es de esta capacidad. La creación vacía sí lo es.
        if ((tipo === 'doc' || tipo === 'documento') && input?.contenido) {
          const d = await google.createDoc(input.name, input.contenido, { parentId: input.folder_id })
          return { ok: true, id: d.id, name: input.name, link: d.link }
        }
        const r = await drive().crearNativo({
          nombre: input.name, tipo, padre: input.folder_id ?? null,
          clave_idempotencia: input.clave_idempotencia ?? null,
        })
        return { ok: true, id: r.referencia.file_id, name: r.referencia.name, link: r.referencia.web_view_link, idempotente: r.idempotente, verificado: r.verificado.campos }
      }),
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
        description: 'Renombra un archivo o carpeta existente de Drive. Pasá file_id y new_name. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, new_name: { type: 'string' } },
          required: ['file_id', 'new_name'],
        },
      },
      run: caraFina(async (input) => {
        if (!input?.file_id || !input?.new_name) return { error: 'faltan file_id o new_name' }
        // El nombre que se devuelve es el RELEÍDO de Drive, no el que contestó el PATCH.
        const r = await drive().renombrar({ file_id: input.file_id, nombre: input.new_name })
        return { ok: true, id: r.referencia.file_id, name: r.referencia.name, antes: r.antes.name, verificado: r.verificado.campos }
      }),
    },
    'drive.move': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_move',
        description: 'Mueve un archivo o carpeta a otra carpeta de Drive (para ORGANIZAR). Pasá file_id y folder_id (carpeta destino; buscala con drive_list/drive_find). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, folder_id: { type: 'string', description: 'ID de la carpeta destino' } },
          required: ['file_id', 'folder_id'],
        },
      },
      run: caraFina(async (input) => {
        if (!input?.file_id || !input?.folder_id) return { error: 'faltan file_id o folder_id (carpeta destino)' }
        const r = await drive().mover({ file_id: input.file_id, destino: input.folder_id })
        return { ok: true, id: r.referencia.file_id, name: r.referencia.name, parents: r.referencia.parents, antes: r.antes.parents, verificado: r.verificado.campos }
      }),
    },
    'drive.batchupdate': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_batch_update',
        description:
          'Escribe VARIOS rangos de un Google Sheet en UNA sola operación (potente y rápido): ideal para completar un bloque entero de un presupuesto de una vez, no celda por celda. Pasá file_id y updates = lista de { range, values } (cada values es matriz de filas). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
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
        return conPestanasSiFalla(google, input.file_id, async () => {
          const r = await google.batchUpdateValues(input.file_id, data)
          const rangos = r.responses?.map((x) => x.updatedRange) ?? data.map((d) => d.range)
          // Verificar cada rango escrito que tenía fórmulas.
          const errs = new Set()
          for (let i = 0; i < data.length; i++) for (const e of await verificarErrores(google, input.file_id, rangos[i] || data[i].range, data[i].values)) errs.add(e)
          const errList = [...errs]
          return {
            ok: errList.length === 0, updated_ranges: rangos, total_updated_cells: r.totalUpdatedCells ?? null,
            ...(errList.length ? { advertencia: avisoErrorCeldas(errList), celdas_con_error: errList } : {}),
          }
        })
      },
    },
    'drive.insertrows': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_insert_rows',
        description:
          'Inserta N filas VACÍAS en una pestaña, a partir de una fila (empuja el resto hacia abajo sin romper nada). Para agregar espacio en medio de una tabla. Pasá file_id, tab (nombre de la pestaña), at_row (fila 1-based donde insertar) y count. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
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
          'Borra N filas de una pestaña a partir de una fila (elimina filas enteras, sube el resto). Pasá file_id, tab, from_row (1-based) y count. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
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
        description: 'Vacía el contenido de un rango de celdas (sin borrar el formato). Pasá file_id y range (ej. "Presupuesto!B5:F40"). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' }, range: { type: 'string' } }, required: ['file_id', 'range'] },
      },
      async run(input) {
        if (!input?.file_id || !input?.range) return { error: 'faltan file_id o range' }
        const r = await google.clearValues(input.file_id, input.range, { yaGuardado: true }) // drive.clear: el dueño la aprueba
        return { ok: true, cleared_range: r.clearedRange ?? input.range }
      },
    },
    // Faltaban las dos operaciones más básicas sobre una pestaña: renombrarla y borrarla.
    // drive_rename existe pero es para ARCHIVOS, así que "renombrá la pestaña X" no tenía forma de
    // ejecutarse: había que crear otra, copiar todo y borrar la vieja — y en el medio se pierden las
    // referencias de las fórmulas que apuntaban a la pestaña original.
    'drive.rename_tab': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_renombrar_pestana',
        description:
          'RENOMBRA una pestaña (hoja) de un Google Sheet conservando su contenido, su formato y — lo ' +
          'importante — todas las fórmulas que la referencian desde otras pestañas, que Google reescribe ' +
          'solo. Usá esto en vez de crear una pestaña nueva y borrar la vieja: eso rompe las referencias. ' +
          'Pasá file_id, tab (nombre actual) y nuevo_nombre. NO es drive_rename, que renombra el ARCHIVO.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, tab: { type: 'string' }, nuevo_nombre: { type: 'string' } },
          required: ['file_id', 'tab', 'nuevo_nombre'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab || !input?.nuevo_nombre) return { error: 'faltan file_id, tab o nuevo_nombre' }
        const meta = (await google.getSheetMeta(input.file_id)).find((s) => s.title === input.tab)
        if (!meta) return { error: `no encontré la pestaña "${input.tab}"` }
        await google.spreadsheetBatchUpdate(input.file_id, [{
          updateSheetProperties: { properties: { sheetId: meta.sheetId, title: input.nuevo_nombre }, fields: 'title' },
        }])
        return { ok: true, antes: input.tab, ahora: input.nuevo_nombre }
      },
    },

    'drive.delete_tab': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_borrar_pestana',
        description:
          'BORRA una pestaña entera de un Google Sheet. Es IRREVERSIBLE y rompe cualquier fórmula que la ' +
          'referencie (quedan en #REF!). Antes de usarla, verificá que nada dependa de esa pestaña. ' +
          'Pasá file_id y tab.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, tab: { type: 'string' } },
          required: ['file_id', 'tab'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.tab) return { error: 'faltan file_id o tab' }
        const hojas = await google.getSheetMeta(input.file_id)
        const meta = hojas.find((s) => s.title === input.tab)
        if (!meta) return { error: `no encontré la pestaña "${input.tab}"` }
        if (hojas.length <= 1) return { error: 'es la única pestaña del archivo: no se puede borrar' }
        await google.spreadsheetBatchUpdate(input.file_id, [{ deleteSheet: { sheetId: meta.sheetId } }])
        return { ok: true, borrada: input.tab }
      },
    },

    'drive.addtab': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_add_tab',
        description:
          'Crea una PESTAÑA (hoja) NUEVA dentro de un Google Sheet que YA EXISTE (no crea un archivo nuevo — para eso está drive_create). USALO ANTES de escribir en una pestaña que todavía no existe: primero drive_add_tab, y RECIÉN DESPUÉS drive_batch_update/drive_update sobre esa pestaña. Sin esto, escribir en una pestaña inexistente falla con "Unable to parse range". Pasá file_id y title. Opcional index (0 = primera; ej. 1 la deja al lado de la primera). Si el nombre tiene espacios, al escribir después el rango va entre comillas simples (ej. \'Panel Caja\'!A1:D1) — la tool te devuelve ese rango listo en "rango_para_escribir". Si ya existe una pestaña con ese nombre NO la duplica. Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del Google Sheet existente' },
            title: { type: 'string', description: 'nombre de la pestaña nueva' },
            index: { type: 'number', description: 'posición opcional (0 = primera pestaña); si no, va al final' },
          },
          required: ['file_id', 'title'],
        },
      },
      async run(input) {
        if (!input?.file_id || !input?.title) return { error: 'faltan file_id o title' }
        const existentes = await google.getSheetMeta(input.file_id)
        const ya = existentes.find((s) => s.title === input.title)
        if (ya) {
          const rango = /\s/.test(input.title) ? `'${input.title}'!A1` : `${input.title}!A1`
          return { ok: true, ya_existia: true, title: input.title, sheet_id: ya.sheetId, rango_para_escribir: rango, nota: 'la pestaña ya existía; no se duplicó (escribí directo con drive_batch_update)' }
        }
        const props = { title: input.title, ...(Number.isInteger(input?.index) ? { index: input.index } : {}) }
        const r = await google.spreadsheetBatchUpdate(input.file_id, [{ addSheet: { properties: props } }])
        const created = r?.replies?.[0]?.addSheet?.properties
        const rango = /\s/.test(input.title) ? `'${input.title}'!A1` : `${input.title}!A1`
        return { ok: true, title: input.title, sheet_id: created?.sheetId ?? null, rango_para_escribir: rango }
      },
    },
    'drive.copy': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'drive_copy',
        description:
          'DUPLICA un archivo existente (una plantilla o un presupuesto anterior) para partir de él. CLAVE para armar un presupuesto nuevo desde uno parecido. Pasá file_id (a copiar), name (nombre de la copia) y opcional folder_id (dónde dejarla). Se aplica AL INSTANTE al llamarla (no pidas aprobación).',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string' }, name: { type: 'string' }, folder_id: { type: 'string' } },
          required: ['file_id', 'name'],
        },
      },
      run: caraFina(async (input) => {
        if (!input?.file_id || !input?.name) return { error: 'faltan file_id o name' }
        const r = await drive().copiar({
          file_id: input.file_id, nombre: input.name, destino: input.folder_id ?? null,
          clave_idempotencia: input.clave_idempotencia ?? null,
        })
        const ref = r.referencia
        return { ok: true, id: ref.file_id, name: ref.name, link: ref.web_view_link, idempotente: r.idempotente, verificado: r.verificado.campos, navigate: { url: ref.web_view_link, name: ref.name, file_id: ref.file_id } }
      }),
    },
    'drive.trash': {
      capability: 'drive.write', // Baja REVERSIBLE (papelera) → requiere aprobación, no es Nivel F
      account: 'ecsas',
      schema: {
        name: 'drive_trash',
        description: 'Da de BAJA un archivo/carpeta mandándolo a la PAPELERA (reversible, se puede restaurar 30 días). Pasá file_id. Se aplica AL INSTANTE al llamarla (no pidas aprobación). (El borrado definitivo sigue prohibido.)',
        input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
      },
      run: caraFina(async (input) => {
        if (!input?.file_id) return { error: 'falta file_id' }
        const r = await drive().archivar({ file_id: input.file_id })
        return { ok: true, id: r.referencia.file_id, name: r.referencia.name, trashed: r.referencia.trashed, idempotente: r.idempotente, verificado: r.verificado.campos }
      }),
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
