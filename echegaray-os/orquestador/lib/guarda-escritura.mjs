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
// externa, sin nada del dueño que proteger — y candar un espejo lo congelaría. Falla ABIERTO: si no hay
// base para consultar, se escribe igual (disponibilidad); la preservación celda a celda de
// escribirPreservando sigue como segunda línea para los que lo usan.

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
 * Falla ABIERTO: ante cualquier error devuelve las que pudo confirmar (nunca bloquea de más), y si no
 * hay base no bloquea nada — la disponibilidad manda y escribirPreservando protege celda a celda.
 * firmaGuardia, además de detectar la edición, AUTO-CANDA la pestaña: la próxima vez se bloquea por
 * candado barato, sin releerla entera.
 */
export async function evaluarBloqueadas(cliente, fileId, tabs = []) {
  const bloqueadas = new Set()
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return bloqueadas
  try {
    const { estaBloqueada } = await import('./pestana-bloqueada.mjs')
    for (const t of protegibles) { if (await estaBloqueada({}, fileId, t).catch(() => false)) bloqueadas.add(t) }
  } catch { /* sin base: no se puede consultar el candado */ }
  try {
    const { firmaGuardia } = await import('./firma-tab.mjs')
    for (const t of protegibles) {
      if (bloqueadas.has(t)) continue
      const { editada } = await firmaGuardia(cliente, fileId, t, refDeTab(t)).catch(() => ({ editada: false }))
      if (editada) bloqueadas.add(t)
    }
  } catch { /* sin base: la firma no está disponible */ }
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
 * LA GUARDA COMPLETA, para un choke point de escritura de valores. Devuelve el `data` filtrado a lo que
 * se puede escribir y una función `sellar()` para llamar DESPUÉS de escribir. Un solo lugar: lo usan
 * batchUpdateValues y updateSheetValues.
 *
 * @returns {Promise<{data:any[], bloqueadas:string[], sellar:() => Promise<void>}>}
 */
export async function guardarEscritura(cliente, fileId, data) {
  const tabs = tabsProtegibles(data)
  if (!tabs.length) return { data, bloqueadas: [], sellar: async () => {} }
  const bloqueadas = await evaluarBloqueadas(cliente, fileId, tabs)
  if (!bloqueadas.size) return { data, bloqueadas: [], sellar: () => sellarTabs(cliente, fileId, tabs) }
  const { permitido } = separarPermitido(data, bloqueadas)
  for (const t of bloqueadas) console.log(`  🔒 "${t}" bajo tu control (candado/edición): no la piso — escritura protegida en el portón.`)
  const escritos = tabsProtegibles(permitido)
  return { data: permitido, bloqueadas: [...bloqueadas], sellar: () => sellarTabs(cliente, fileId, escritos) }
}
