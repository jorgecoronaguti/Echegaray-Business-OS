// GUARDA CENTRAL DE ESCRITURA — la protección de tus ediciones deja de ser opt-in por escritor.
//
// POR QUÉ (25/07). El dueño, otra vez y con razón: "sigue sin respetar lo que hago... arreglá ese
// super bug, búsqueda profunda y resolución". Tuvo que restaurar una versión de ayer por el historial.
//
// LA CAUSA GENERAL. La protección (candado + firma) vivía SOLO dentro de escribirPreservando. Los
// escritores CRUDOS —los que llaman google.batchUpdateValues / updateSheetValues directo— la salteaban:
// chequeaban a lo sumo el candado explícito, nunca la FIRMA (¿editaste la pestaña desde mi última
// escritura?). Esa detección de edición sólo corría en el portón. Resultado: editabas una pestaña a
// mano, no la candabas, y un escritor crudo te la pisaba en la corrida siguiente. Era whack-a-mole:
// cada script nuevo (o crudo) era otra chance de olvidarse la guarda.
//
// LA RESOLUCIÓN. Esta guarda se aplica en el ÚNICO punto por el que pasa toda escritura de valores
// (batchUpdateValues, updateSheetValues, en google.mjs). No se puede saltear "olvidándose": es el choke
// point, no la disciplina de cada autor.
//
// CONTRATO. Una pestaña se protege si está CANDADA o si una persona la editó desde el último sello del
// OS (firma). Se DESCARTAN los rangos de esas pestañas (no se pisan) y se avisa. Los rangos de pestañas
// libres se escriben normal, y después se SELLA su firma (así la propia escritura cruda del OS no se
// confunde con una edición humana en la próxima corrida). Las pestañas espejo (nombre con prefijo `_`,
// p.ej. _BANCO_RAW / _J_OBREROS) NUNCA se guardan ni se sellan: son copias byte a byte de una fuente
// externa, sin nada del dueño que proteger — y candar un espejo lo congelaría. Falla CERRADO (26/07):
// si no se puede consultar la base o releer una pestaña, NO se pisa contenido — respetar la edición del
// dueño vale más que la disponibilidad de la escritura. Ver evaluarBloqueadas.

/** Nombre de pestaña de un rango A1 ("Compras!A1:B2" → "Compras"; "'Cheques Emitidos'!A5" → "Cheques Emitidos"). */
export function nombreTab(range) {
  const s = String(range ?? '')
  const bang = s.lastIndexOf('!')
  if (bang < 0) return null
  return s.slice(0, bang).replace(/^'(.*)'$/, '$1').replace(/''/g, "'")
}

/** ¿Es una pestaña de CONTENIDO (protegible)? Los espejos del OS (prefijo `_`) no lo son. */
export function esProtegible(tab) {
  return Boolean(tab) && !String(tab).startsWith('_')
}

/** Pestañas de contenido distintas afectadas por un `data` de batchUpdateValues (excluye espejos `_`). */
export function tabsProtegibles(data = []) {
  const set = new Set()
  for (const d of data) { const t = nombreTab(d?.range); if (esProtegible(t)) set.add(t) }
  return [...set]
}

/** Parte el `data` en lo permitido (pestaña libre o espejo) y lo bloqueado (pestaña protegida). Puro. */
export function separarPermitido(data = [], bloqueadas = new Set()) {
  const permitido = []; const bloqueado = []
  for (const d of data) {
    const t = nombreTab(d?.range)
    ;(t && bloqueadas.has(t) ? bloqueado : permitido).push(d)
  }
  return { permitido, bloqueado }
}

/** ref citada para la API a partir del nombre de pestaña ("Cheques Emitidos" → "'Cheques Emitidos'"). */
function refDeTab(tab) {
  return /[^A-Za-z0-9_]/.test(tab) ? `'${String(tab).replace(/'/g, "''")}'` : tab
}

/**
 * Evalúa qué pestañas de contenido están protegidas (candada o editada por humano). Impura (base + Sheet).
 *
 * Falla CERRADO (26/07, tras perder la versión del dueño otra vez). La regla del dueño es explícita:
 * respetar sus ediciones vale MÁS que la disponibilidad de la escritura. Por eso:
 *  · Si la BASE no responde, no se puede saber qué pestañas tomó ni cuáles editó → se protegen TODAS
 *    las de contenido (mejor un Sheet desactualizado que una edición destruida; la base se recupera
 *    sola y el próximo ciclo escribe).
 *  · Si no se puede RELEER una pestaña para comparar su firma (`noVerificable`), se protege esa pestaña.
 * Antes fallaba ABIERTO (ante duda, escribía) — que es justo lo contrario de lo que el dueño pide.
 * firmaGuardia, además de detectar la edición, AUTO-CANDA la pestaña: la próxima vez se bloquea barato.
 */
export async function evaluarBloqueadas(cliente, fileId, tabs = []) {
  const bloqueadas = new Set()
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return bloqueadas
  // ¿La base responde? Sin ella no hay forma de conocer candado ni firma → fail-closed total.
  try {
    const { query } = await import('./db.mjs')
    await query('select 1')
  } catch {
    for (const t of protegibles) bloqueadas.add(t)
    console.log('  🔒 base no accesible: no puedo verificar tus ediciones → no piso ninguna pestaña de contenido (fail-closed).')
    return bloqueadas
  }
  try {
    const { estaBloqueada } = await import('./pestana-bloqueada.mjs')
    for (const t of protegibles) { if (await estaBloqueada({}, fileId, t).catch(() => false)) bloqueadas.add(t) }
  } catch { /* la base respondió el probe; un fallo puntual acá no habilita a pisar */ }
  try {
    const { firmaGuardia } = await import('./firma-tab.mjs')
    for (const t of protegibles) {
      if (bloqueadas.has(t)) continue
      const { editada, noVerificable } = await firmaGuardia(cliente, fileId, t, refDeTab(t)).catch(() => ({ editada: false, noVerificable: true }))
      // editada = la tocaste; noVerificable = no pude confirmar que está intacta. En ambos casos, no piso.
      if (editada || noVerificable) bloqueadas.add(t)
    }
  } catch { /* fail-closed: ante un fallo del subsistema de firma, no se libera nada nuevo */ }
  return bloqueadas
}

/** Sella la firma de las pestañas de contenido que el OS acaba de escribir (para no confundir su propia escritura con una edición humana la próxima vez). */
export async function sellarTabs(cliente, fileId, tabs = []) {
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return
  try {
    const { sellarFirma } = await import('./firma-tab.mjs')
    for (const t of protegibles) await sellarFirma(cliente, fileId, t, refDeTab(t)).catch(() => {})
  } catch { /* no crítico */ }
}

/**
 * RE-INYECCIÓN DE CELDAS APRENDIDAS (la otra mitad de "entender+reconciliar"). Una pestaña que la
 * reconciliación entendió vuelve a mantenerse sola (descandada), pero las celdas que el dueño corrigió
 * o cargó quedaron registradas como 'activa'. Acá, en el ÚNICO punto por el que pasa toda escritura de
 * valores, se estampa el valor del dueño sobre lo que produjo el generador: el generador regenera TODO,
 * esas celdas conservan lo del dueño. Es el mecanismo que hace que "el generador respete la celda
 * aprendida" sin que cada generador tenga que saber nada — igual que la guarda, choke point, no
 * disciplina de cada autor. Falla ABIERTO: sin base o sin celdas aprendidas, `data` pasa igual.
 */
async function reInyectarAprendidas(fileId, data) {
  try {
    const tabs = tabsProtegibles(data)
    if (!tabs.length) return data
    const { celdasActivas, reInyectarEntrada } = await import('./reconciliacion-firma.mjs')
    const porTab = new Map()
    for (const t of tabs) {
      const m = await celdasActivas({}, fileId, t).catch(() => null)
      if (m && m.size) porTab.set(t, m)
    }
    if (!porTab.size) return data
    return data.map((entrada) => {
      const t = nombreTab(entrada?.range)
      const m = t && porTab.get(t)
      return m ? reInyectarEntrada(entrada, m) : entrada
    })
  } catch { return data }
}

/**
 * LA GUARDA COMPLETA, para un choke point de escritura de valores. Devuelve el `data` filtrado a lo que
 * se puede escribir (y con las celdas aprendidas del dueño re-inyectadas) y una función `sellar()` para
 * llamar DESPUÉS de escribir. Un solo lugar: lo usan batchUpdateValues y updateSheetValues.
 *
 * @returns {Promise<{data:any[], bloqueadas:string[], sellar:() => Promise<void>}>}
 */
export async function guardarEscritura(cliente, fileId, data) {
  const tabs = tabsProtegibles(data)
  if (!tabs.length) return { data, bloqueadas: [], sellar: async () => {} }
  const bloqueadas = await evaluarBloqueadas(cliente, fileId, tabs)
  if (!bloqueadas.size) {
    const conAprendidas = await reInyectarAprendidas(fileId, data)
    return { data: conAprendidas, bloqueadas: [], sellar: () => sellarTabs(cliente, fileId, tabs) }
  }
  const { permitido } = separarPermitido(data, bloqueadas)
  for (const t of bloqueadas) console.log(`  🔒 "${t}" bajo tu control (candado/edición): no la piso — escritura protegida en el portón.`)
  const escritos = tabsProtegibles(permitido)
  const conAprendidas = await reInyectarAprendidas(fileId, permitido)
  return { data: conAprendidas, bloqueadas: [...bloqueadas], sellar: () => sellarTabs(cliente, fileId, escritos) }
}

// ═══ EL MISMO CANDADO, PARA spreadsheetBatchUpdate (updateCells/copyPaste/pasteData/appendCells) ═══
//
// spreadsheetBatchUpdate mezcla FORMATO/estructura (que no pisa datos de nadie) con requests que SÍ
// escriben CONTENIDO. Sólo esos últimos pueden pisar lo que editaste. Se los identifica por tipo y se
// saca su sheetId; el resto (colores, anchos, merges, dimensiones) pasa siempre — nunca se bloquea un
// formateo, sólo una escritura de contenido a una pestaña que tomaste.

/** sheetId del request SI escribe CONTENIDO (no formato). null si es formato/estructura puro. Puro. */
export function sheetIdDeRequestContenido(req) {
  if (!req || typeof req !== 'object') return null
  if (req.updateCells) {
    const f = String(req.updateCells.fields ?? '')
    // CONTENIDO = todo lo que puede pisar lo que dejó una persona en una celda: su VALOR
    // (userEnteredValue) o su NOTA (RESPETO-NOTAS, 27/07). Una nota vive FUERA del valor de la celda,
    // así que reescribir la pestaña no la toca — pero un `updateCells{fields:'note'}` (p.ej. el
    // limpiador de notas basura, o un clear-all de generador) SÍ la borra. Antes `fields:'note'` no se
    // clasificaba como contenido → cruzaba el portón aun con la pestaña candada/editada y borraba una
    // nota humana. Regla de Oro #1: si una persona tocó la pestaña, no se pisa NADA suyo — valor O nota.
    // Con esto la nota sigue EXACTAMENTE el mismo camino que el valor (evaluarBloqueadas): en pestaña
    // libre pasa y se re-sella; en candada/editada se frena. Ningún flujo legítimo escribe notas
    // saltando el candado (la política del repo es que los generadores no escriben notas de procedencia
    // —sin-notas-generadas.test.mjs—; sólo las CLAREAN, y siempre al regenerar una pestaña libre).
    // El FORMATO puro (userEnteredFormat, textFormat…) sigue pasando: nunca destruye datos del dueño.
    if (f === '*' || /userEnteredValue/.test(f) || /\bnote\b/.test(f)) return req.updateCells.range?.sheetId ?? req.updateCells.start?.sheetId ?? null
    return null
  }
  if (req.copyPaste) {
    const pt = String(req.copyPaste.pasteType ?? 'PASTE_NORMAL')
    // Pegar SÓLO formato/validación/condicional no pisa el valor de una celda.
    if (/^PASTE_(FORMAT|DATA_VALIDATION|CONDITIONAL_FORMATTING)$/.test(pt)) return null
    return req.copyPaste.destination?.sheetId ?? null
  }
  if (req.pasteData) return req.pasteData.coordinate?.sheetId ?? null
  if (req.appendCells) return req.appendCells.sheetId ?? null
  if (req.cutPaste) return req.cutPaste.destination?.sheetId ?? null
  return null
}

/** Parte los requests en permitidos y bloqueados según los sheetId protegidos. Puro. */
export function separarRequests(requests = [], sheetIdsBloqueados = new Set()) {
  const permitidos = []; const bloqueados = []
  for (const r of requests) {
    const sid = sheetIdDeRequestContenido(r)
    ;(sid != null && sheetIdsBloqueados.has(sid) ? bloqueados : permitidos).push(r)
  }
  return { permitidos, bloqueados }
}

/**
 * Guarda para spreadsheetBatchUpdate: descarta los requests que escriben contenido sobre pestañas
 * candadas/editadas, deja pasar formato y estructura. Necesita mapear sheetId→pestaña (getSheetMeta).
 * @returns {Promise<{requests:any[], bloqueadas:string[], sellar:() => Promise<void>}>}
 */
export async function guardarRequests(cliente, fileId, requests) {
  const sids = [...new Set((requests || []).map(sheetIdDeRequestContenido).filter((s) => s != null))]
  if (!sids.length) return { requests, bloqueadas: [], sellar: async () => {} }
  const meta = await cliente.getSheetMeta(fileId)
  const id2tab = new Map(meta.map((m) => [m.sheetId, m.title]))
  const tabsContenido = sids.map((s) => id2tab.get(s)).filter(esProtegible)
  const bloqTabs = await evaluarBloqueadas(cliente, fileId, tabsContenido)
  const escritos = [...new Set(tabsContenido)].filter((t) => !bloqTabs.has(t))
  if (!bloqTabs.size) return { requests, bloqueadas: [], sellar: () => sellarTabs(cliente, fileId, escritos) }
  const bloqSids = new Set([...id2tab].filter(([, t]) => bloqTabs.has(t)).map(([s]) => s))
  const { permitidos, bloqueados } = separarRequests(requests, bloqSids)
  for (const t of bloqTabs) console.log(`  🔒 "${t}" bajo tu control (candado/edición): salteo escritura(s) de contenido, dejo el formato.`)
  void bloqueados
  return { requests: permitidos, bloqueadas: [...bloqTabs], sellar: () => sellarTabs(cliente, fileId, escritos) }
}
