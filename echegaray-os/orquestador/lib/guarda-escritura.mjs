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
import { CLASE, clasificarRequest } from './clasificar-request.mjs'

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
 * Por qué está protegida una pestaña. Los dos primeros son DECISIÓN del dueño o falta de información;
 * los dos marcados como deducidos (`motivoDeducido`) los infirió el OS de la firma.
 */
export const MOTIVO = {
  SIN_BASE: 'sin-base',                            // no se pudo consultar candado ni firma (fail-closed)
  CANDADO_DUENO: 'candado-dueño',                  // la candó él: "es mía, no la toques"
  CANDADO_AUTO: 'candado-auto',                    // la candó el OS al detectar por firma que cambió
  FIRMA_EDITADA: 'firma-editada',                  // la firma difiere de la última escritura del OS
  FIRMA_NO_VERIFICABLE: 'firma-no-verificable',    // no se pudo releer la pestaña para comparar
}

/** ¿El motivo lo DEDUJO el OS de la firma (en vez de declararlo el dueño o desconocerse)? */
export function motivoDeducido(motivo) {
  return motivo === MOTIVO.FIRMA_EDITADA || motivo === MOTIVO.CANDADO_AUTO
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
export async function evaluarBloqueadas(cliente, fileId, tabs = [], opciones = {}) {
  return new Set((await evaluarBloqueadasConMotivo(cliente, fileId, tabs, opciones)).keys())
}

/**
 * Lo mismo que `evaluarBloqueadas`, pero diciendo POR QUÉ está protegida cada pestaña. Existe porque hay
 * una diferencia que la decisión binaria borra: un candado que puso EL DUEÑO es su voluntad declarada,
 * mientras que la firma —y el auto-candado que ella dispara— son una DEDUCCIÓN del OS ("esto cambió desde
 * mi última escritura"). La deducción es correcta, pero su conclusión (proteger la pestaña ENTERA) es más
 * ancha que el riesgo real cuando la escritura no puede pisar nada. Ver `soloFilasVacias`, más abajo.
 *
 * @returns {Promise<Map<string, string>>} pestaña → uno de MOTIVO
 */
export async function evaluarBloqueadasConMotivo(cliente, fileId, tabs = [], { compartida = false } = {}) {
  const motivos = new Map()
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return motivos
  // ¿La base responde? Sin ella no hay forma de conocer candado ni firma → fail-closed total.
  try {
    const { query } = await import('./db.mjs')
    await query('select 1')
  } catch {
    for (const t of protegibles) motivos.set(t, MOTIVO.SIN_BASE)
    console.log('  🔒 base no accesible: no puedo verificar tus ediciones → no piso ninguna pestaña de contenido (fail-closed).')
    return motivos
  }
  try {
    const { bloqueoDe } = await import('./pestana-bloqueada.mjs')
    for (const t of protegibles) {
      const b = await bloqueoDe({}, fileId, t).catch(() => null)
      if (b?.bloqueada) motivos.set(t, b.por === 'auto' ? MOTIVO.CANDADO_AUTO : MOTIVO.CANDADO_DUENO)
    }
  } catch { /* la base respondió el probe; un fallo puntual acá no habilita a pisar */ }
  // Pestaña compartida: la firma no aplica (y por lo tanto tampoco el auto-candado). Ver el encabezado.
  if (compartida) return motivos
  try {
    const { firmaGuardia } = await import('./firma-tab.mjs')
    for (const t of protegibles) {
      if (motivos.has(t)) continue
      const { editada, noVerificable } = await firmaGuardia(cliente, fileId, t, refDeTab(t)).catch(() => ({ editada: false, noVerificable: true }))
      // editada = la tocaste; noVerificable = no pude confirmar que está intacta. En ambos casos, no piso.
      if (editada) motivos.set(t, MOTIVO.FIRMA_EDITADA)
      else if (noVerificable) motivos.set(t, MOTIVO.FIRMA_NO_VERIFICABLE)
    }
  } catch { /* fail-closed: ante un fallo del subsistema de firma, no se libera nada nuevo */ }
  return motivos
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

// ═══ EXCEPCIÓN ANGOSTA `soloFilasVacias` (03/08) — el APPEND que no puede pisar nada ═══
//
// EL CASO MEDIDO. `cargar-comprobantes-compras.mjs` agrega un fajo de comprobantes al final de "Compras":
// escribe estrictamente POR DEBAJO de la última fila con datos, en celdas que hoy están vacías. El 03/08,
// contra el Sheet real, esa carga se descartó entera —la firma de "Compras" difería porque el dueño la
// había editado— y las 7 filas quedaron sin escribir. Proteger la pestaña ENTERA es la respuesta correcta
// para un generador que la reescribe; para un append es más ancha que el riesgo: abajo no hay nada suyo.
//
// POR QUÉ ES SEGURA, que es lo único que la justifica. La excepción NO le cree al llamador cuando dice
// "esto es un append": RELEE el destino y sólo lo escribe si confirma que está COMPLETAMENTE VACÍO.
// Escribir sobre vacío es la única escritura de la que se puede AFIRMAR que no destruye trabajo de nadie
// —no hay contenido que reemplazar—, y por eso es la única excepción admisible al candado. Si el destino
// no se puede releer, no se escribe: mismo fail-closed que el resto de la guarda, porque "no pude
// confirmar que estaba vacío" no es "estaba vacío".
//
// LO QUE NO AFLOJA:
//  · El CANDADO EXPLÍCITO del dueño (`bloqueada_por='dueño'`, pestana-candado.mjs) frena igual. Candar es
//    su voluntad declarada sobre la pestaña entera, no una inferencia del OS: no se negocia con una
//    heurística. Sólo se levanta lo que el OS dedujo solo (firma editada y su auto-candado).
//  · El fail-closed por base caída (`sin-base`): sin base no se sabe si la pestaña está candada A MANO,
//    así que tampoco se sabe si la excepción aplica.
//  · La firma NO SE SELLA para una pestaña rescatada (ver `guardarEscritura`): sellar borraría la
//    evidencia de que el dueño la editó, y la próxima reescritura COMPLETA de un generador —esa que sí
//    pisa— pasaría el control como si nada hubiera cambiado. El append entra; la protección queda puesta.
//  · Es OPT-IN: sólo la pide quien sabe que su escritura es un append. Ningún generador la hereda.

/**
 * De los rangos que la guarda bloqueó, devuelve los que se pueden escribir igual porque su destino se
 * relee y se confirma VACÍO. Impura sólo del lado Sheets. Fail-closed en las dos formas de la duda: si no
 * se puede releer, o si hay una sola celda con contenido, el rango queda descartado con su motivo.
 *
 * @returns {Promise<{rescatados:any[], descartados:{range:string, motivo:string}[]}>}
 */
export async function rescatarFilasVacias(cliente, fileId, bloqueado = [], motivos = new Map()) {
  const rescatados = []; const descartados = []
  for (const d of bloqueado) {
    const motivo = motivos.get(nombreTab(d?.range))
    if (!motivoDeducido(motivo)) { descartados.push({ range: d?.range, motivo: `la pestaña está protegida por vos o sin verificar (${motivo}): eso no lo levanta un append` }); continue }
    let previo
    try { previo = await cliente.readSheetValues(fileId, d.range) } catch { previo = undefined }
    if (previo === undefined) { descartados.push({ range: d?.range, motivo: 'no pude releer el destino para confirmar que está vacío (fail-closed)' }); continue }
    if (!gridVacia(previo)) { descartados.push({ range: d?.range, motivo: 'el destino NO está vacío: ahí ya hay algo y un append no lo pisa' }); continue }
    rescatados.push(d)
  }
  return { rescatados, descartados }
}

/**
 * LA GUARDA COMPLETA, para un choke point de escritura de valores. Devuelve el `data` filtrado a lo que
 * se puede escribir (y con las celdas aprendidas del dueño re-inyectadas) y una función `sellar()` para
 * llamar DESPUÉS de escribir. Un solo lugar: lo usan batchUpdateValues y updateSheetValues.
 *
 * `soloFilasVacias` es la excepción documentada arriba: opt-in, y sólo para destinos que se confirman
 * vacíos releyéndolos.
 *
 * @returns {Promise<{data:any[], bloqueadas:string[], rescatadas?:string[], motivo?:string, sellar:() => Promise<void>}>}
 */
export async function guardarEscritura(cliente, fileId, data, { chequearVacio = true, compartida = false, soloFilasVacias = false } = {}) {
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
  const motivos = await evaluarBloqueadasConMotivo(cliente, fileId, tabs, { compartida })
  const bloqueadas = new Set(motivos.keys())
  // En una pestaña compartida el OS no es dueño de nada: sellar una firma que la próxima edición de
  // administración va a invalidar sólo fabrica un baseline falso. No se sella.
  const sellarSi = (t) => (compartida ? async () => {} : () => sellarTabs(cliente, fileId, t))
  if (!bloqueadas.size) {
    const conAprendidas = await reInyectarAprendidas(fileId, data)
    return { data: conAprendidas, bloqueadas: [], sellar: sellarSi(tabs) }
  }
  const { permitido, bloqueado } = separarPermitido(data, bloqueadas)
  let rescatados = []
  if (soloFilasVacias && bloqueado.length) {
    const r = await rescatarFilasVacias(cliente, fileId, bloqueado, motivos)
    rescatados = r.rescatados
    for (const x of r.rescatados) console.log(`  ✚ "${x.range}": el destino está VACÍO — lo escribo igual (append: no pisa nada tuyo).`)
    for (const x of r.descartados) console.log(`  🔒 "${x.range}": no lo escribo — ${x.motivo}.`)
  }
  const conservados = [...permitido, ...rescatados]
  const rescatadas = tabsProtegibles(rescatados)
  for (const t of bloqueadas) {
    if (rescatadas.includes(t)) continue
    console.log(`  🔒 "${t}" bajo tu control (${motivos.get(t)}): no la piso — escritura protegida en el portón.`)
  }
  // Se sella SÓLO lo que estaba libre. Sellar una pestaña rescatada borraría la evidencia de la edición
  // del dueño y dejaría entrar la próxima reescritura completa del generador. Ver el encabezado.
  const escritos = tabsProtegibles(permitido)
  const conAprendidas = await reInyectarAprendidas(fileId, conservados)
  return {
    data: conAprendidas,
    bloqueadas: [...bloqueadas].filter((t) => !rescatadas.includes(t)),
    rescatadas,
    // `porQue` (pestaña → MOTIVO) viaja hasta el llamador para que pueda DECIR qué pasó. `motivo` sigue
    // reservado al cinturón vacío-sobre-lleno: es lo que distingue las dos rutas de bloqueo.
    porQue: Object.fromEntries(motivos),
    sellar: sellarSi(escritos),
  }
}

// ═══ EL MISMO CANDADO, PARA spreadsheetBatchUpdate — Y TAMBIÉN PARA LOS BORRADOS (03/08) ═══
//
// spreadsheetBatchUpdate mezcla requests que sólo cambian la apariencia con requests que DESTRUYEN.
// Hasta hoy la guarda sólo miraba los que escriben una celda y dejaba pasar "el formato y la estructura",
// con `deleteDimension` adentro de ese saco: se podía borrar quince filas de una pestaña candada, pero no
// escribirle una fórmula. La clasificación —y el porqué de cada categoría— vive en clasificar-request.mjs.
//
// LO QUE SE AGREGA ACÁ, además de usar la clasificación nueva:
//  · La atribución es por TODOS los sheetId del request, no por uno (cutPaste vacía el origen).
//  · Un request destructivo que no se puede atribuir a ninguna pestaña se frena si hay ALGUNA protegida.
//  · Se SELLA la firma de toda pestaña que la guarda autorizó a modificar —incluidos los borrados—, para
//    que el OS reconozca su propia escritura en la corrida siguiente en vez de leerla como una edición
//    del dueño. Sin eso, un borrado autorizado auto-candaba la pestaña y bloqueaba la escritura que
//    COMPLETABA la misma operación: la guarda te dejaba romper una pestaña y no te dejaba arreglarla.
//    Sellar NO levanta ningún candado: sólo se sellan las pestañas que NO estaban bloqueadas, así que
//    una pestaña candada por el dueño jamás se sella ni se toca.

export { CLASE, clasificarRequest } from './clasificar-request.mjs'

/**
 * ¿Este request se frena, dados los sheetId protegidos? Puro.
 * Un destructivo sin sheetId atribuible (`todas`) se frena si hay CUALQUIER pestaña protegida.
 */
export function frenaRequest(clasificacion, sheetIdsBloqueados = new Set()) {
  if (clasificacion.clase !== CLASE.DESTRUCTIVO) return false
  if (clasificacion.todas) return sheetIdsBloqueados.size > 0
  return clasificacion.sheetIds.some((s) => sheetIdsBloqueados.has(s))
}

/** Parte los requests en permitidos y bloqueados según los sheetId protegidos. Puro. */
export function separarRequests(requests = [], sheetIdsBloqueados = new Set(), dims = null) {
  const permitidos = []; const bloqueados = []
  for (const r of requests) {
    ;(frenaRequest(clasificarRequest(r, dims), sheetIdsBloqueados) ? bloqueados : permitidos).push(r)
  }
  return { permitidos, bloqueados }
}

/**
 * Guarda para spreadsheetBatchUpdate: descarta los requests que DESTRUYEN (borran, pisan, desplazan o
 * reordenan) sobre pestañas candadas/editadas, y deja pasar la apariencia. Necesita `getSheetMeta` para
 * mapear sheetId→pestaña y para saber si un cambio de tamaño de grilla la agranda o la achica.
 * @returns {Promise<{requests:any[], bloqueadas:string[], sellar:() => Promise<void>}>}
 */
export async function guardarRequests(cliente, fileId, requests) {
  // Primera pasada SIN meta: un batch de pura apariencia no paga ni una llamada a la API.
  if ((requests || []).every((r) => clasificarRequest(r).clase !== CLASE.DESTRUCTIVO)) {
    return { requests, bloqueadas: [], sellar: async () => {} }
  }
  const meta = await cliente.getSheetMeta(fileId)
  const id2tab = new Map(meta.map((m) => [m.sheetId, m.title]))
  const dims = new Map(meta.map((m) => [m.sheetId, { rows: m.rows, cols: m.cols }]))
  const clases = (requests || []).map((r) => clasificarRequest(r, dims))
  const destructivos = clases.filter((c) => c.clase === CLASE.DESTRUCTIVO)
  const hayTodas = destructivos.some((c) => c.todas)
  const atribuidas = new Set()
  for (const c of destructivos) for (const s of c.sheetIds) { const t = id2tab.get(s); if (esProtegible(t)) atribuidas.add(t) }
  // Un destructivo que no se puede atribuir le pega a todas: hay que evaluar todas para poder frenarlo.
  const aEvaluar = hayTodas ? meta.map((m) => m.title).filter(esProtegible) : [...atribuidas]
  const bloqTabs = await evaluarBloqueadas(cliente, fileId, aEvaluar)
  const bloqSids = new Set([...id2tab].filter(([, t]) => bloqTabs.has(t)).map(([s]) => s))
  const permitidos = []
  let pasoAlgunaTodas = false
  requests.forEach((r, i) => {
    if (frenaRequest(clases[i], bloqSids)) return
    if (clases[i].todas && clases[i].clase === CLASE.DESTRUCTIVO) pasoAlgunaTodas = true
    permitidos.push(r)
  })
  // Se sella lo que se modificó y NO estaba bloqueado. Si pasó un request sin pestaña atribuible, cambió
  // cualquiera: se sellan todas las de contenido (sólo puede pasar con ninguna bloqueada).
  const escritos = (pasoAlgunaTodas ? aEvaluar : [...atribuidas]).filter((t) => !bloqTabs.has(t))
  for (const t of bloqTabs) console.log(`  🔒 "${t}" bajo tu control (candado/edición): salteo lo que le borra o le pisa contenido, dejo la apariencia.`)
  return { requests: permitidos, bloqueadas: [...bloqTabs], sellar: () => sellarTabs(cliente, fileId, escritos) }
}
