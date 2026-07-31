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

import { tiene } from './preservar-anotaciones.mjs'

// ═══ CINTURÓN "VACÍO SOBRE LLENO" (28/07, TGUARD) — defensa en profundidad, INDEPENDIENTE de la base ═══
//
// POR QUÉ. La causa del super-bug histórico (un agente en worktree SIN DATABASE_URL) tenía dos mitades:
// (1) la guarda de candado/firma fallaba abierto sin base —ya resuelto: hoy evaluarBloqueadas falla
// CERRADO—, y (2) el generador, también sin base, producía una grilla VACÍA que terminaba BORRANDO la
// pestaña. Esta segunda mitad no la cubre candado/firma: si la pestaña no está candada y su firma es la
// del propio OS (la escribió el OS la vez anterior), una grilla vacía cruzaría el portón y la vaciaría.
//
// LA REGLA, DURA. Una escritura de VALORES cuya grilla no tiene ninguna celda con contenido NO puede
// reemplazar un destino que HOY sí tiene contenido. Se relee el destino (sólo con el cliente de Sheets,
// sin tocar Postgres): si tiene contenido, o si no se puede releer para confirmarlo, se ABORTA ese
// rango (fail-closed). Sólo "vacío sobre vacío" —inofensivo— pasa. Una escritura con contenido nunca se
// relee: cero costo y comportamiento idéntico para el camino feliz. Se aplica a batchUpdateValues y
// updateSheetValues (los que PISAN); clearValues (borrado intencional, con su propia firma en el autor)
// y appendSheetValues (inserta, no pisa) quedan fuera vía `chequearVacio:false`.

/** ¿La grilla no tiene NINGUNA celda con contenido? (vacía, o todo blanco/null/centinela VACIO). Puro. */
export function gridVacia(values) {
  return !Array.isArray(values) || !values.some((fila) => Array.isArray(fila) && fila.some((c) => tiene(c)))
}

/**
 * Filtra de `data` los rangos que dejarían un destino CON CONTENIDO reemplazado por una grilla VACÍA.
 * Impura sólo del lado Sheets (relee el destino); NO consulta la base — funciona aun sin DATABASE_URL.
 * Un rango con grilla no vacía pasa sin releer nada. Un rango con grilla vacía se permite únicamente si
 * el destino ya está vacío; si tiene contenido o no se puede releer, se protege (fail-closed).
 * @returns {Promise<{data:any[], protegidos:{range:string, motivo:string}[]}>}
 */
export async function protegerVacioSobreLleno(cliente, fileId, data = []) {
  const permitido = []; const protegidos = []
  for (const d of data) {
    if (!gridVacia(d?.values)) { permitido.push(d); continue } // escritura con contenido: camino feliz, no se relee
    let previo
    try { previo = await cliente.readSheetValues(fileId, d.range) } catch { previo = undefined }
    if (previo === undefined) {
      protegidos.push({ range: d.range, motivo: 'grilla vacía y no pude releer el destino para confirmar que estaba vacío (fail-closed)' })
      continue
    }
    if (!gridVacia(previo)) {
      protegidos.push({ range: d.range, motivo: 'grilla vacía sobre un destino con contenido (probable grilla rota, p.ej. generador sin base)' })
      continue
    }
    permitido.push(d) // vacío sobre vacío: inofensivo
  }
  return { data: permitido, protegidos }
}

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
 *
 * ── `compartida` (31/07): PESTAÑAS QUE EL OS **NO** GENERA ──────────────────────────────────────
 *
 * La firma responde "¿alguien tocó esta pestaña desde que la escribí?". Eso es evidencia de conflicto
 * SÓLO si el OS es dueño de la pestaña entera (las del Flujo de Caja: las regenera y las sella). En una
 * pestaña COMPARTIDA —`Obreros 26` de JORNALES, que administración carga todos los días y donde el OS
 * sólo pone celdas sueltas— la respuesta es siempre "sí", y no significa conflicto: significa que la
 * planilla se está usando. Aplicarle la firma tenía dos consecuencias, las dos vistas en producción el
 * 30/07: la escritura se descartaba SIEMPRE, y —peor— `firmaGuardia` AUTO-CANDABA la pestaña, así que
 * un falso positivo se convertía en una falla permanente.
 *
 * Con `compartida:true` se sigue aplicando lo que sí protege al dueño —el cinturón vacío-sobre-lleno y
 * el CANDADO explícito, que es su voluntad declarada— y se saltea la firma. Quien la use tiene que
 * traer su propia protección, y más fina: `registrarAsistencia` relee la celda destino y compara su
 * huella justo antes de escribir, y aborta toda la operación si cambió. Se protege la CELDA, que es la
 * unidad que se comparte, en vez de la pestaña.
 */
export async function evaluarBloqueadas(cliente, fileId, tabs = [], { compartida = false } = {}) {
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
  // Pestaña compartida: la firma no aplica (y por lo tanto tampoco el auto-candado). Ver el encabezado.
  if (compartida) return bloqueadas
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
 * @returns {Promise<{data:any[], bloqueadas:string[], motivo?:string, sellar:() => Promise<void>}>}
 */
export async function guardarEscritura(cliente, fileId, data, { chequearVacio = true, compartida = false } = {}) {
  // CINTURÓN 1 — "vacío sobre lleno". Corre PRIMERO y sin base: aunque candado/firma no puedan
  // consultarse, una grilla vacía nunca reemplaza contenido. clearValues/append lo apagan (chequearVacio:false).
  if (chequearVacio) {
    const v = await protegerVacioSobreLleno(cliente, fileId, data)
    for (const p of v.protegidos) console.log(`  🛡 "${p.range}": no piso contenido con una grilla vacía — ${p.motivo}.`)
    data = v.data
    if (!data.length && v.protegidos.length) {
      return { data: [], bloqueadas: v.protegidos.map((p) => p.range), motivo: v.protegidos[0].motivo, sellar: async () => {} }
    }
  }
  const tabs = tabsProtegibles(data)
  if (!tabs.length) return { data, bloqueadas: [], sellar: async () => {} }
  const bloqueadas = await evaluarBloqueadas(cliente, fileId, tabs, { compartida })
  // En una pestaña compartida el OS no es dueño de nada: sellar una firma que la próxima edición de
  // administración va a invalidar sólo fabrica un baseline falso. No se sella.
  const sellarSi = (t) => (compartida ? async () => {} : () => sellarTabs(cliente, fileId, t))
  if (!bloqueadas.size) {
    const conAprendidas = await reInyectarAprendidas(fileId, data)
    return { data: conAprendidas, bloqueadas: [], sellar: sellarSi(tabs) }
  }
  const { permitido } = separarPermitido(data, bloqueadas)
  for (const t of bloqueadas) console.log(`  🔒 "${t}" bajo tu control (candado/edición): no la piso — escritura protegida en el portón.`)
  const escritos = tabsProtegibles(permitido)
  const conAprendidas = await reInyectarAprendidas(fileId, permitido)
  return { data: conAprendidas, bloqueadas: [...bloqueadas], sellar: sellarSi(escritos) }
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
