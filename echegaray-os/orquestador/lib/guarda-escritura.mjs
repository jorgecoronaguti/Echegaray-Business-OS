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

// ═══ EL HISTORIAL DE VERSIONES, ANTES DE TOCAR NADA (01/08) ═══
//
// Regla de oro del dueño, textual: *"antes de revisar modificaciones tienen que revisar el historial de
// versiones y ver si yo he hecho modificaciones en las pestañas y respetarlas"*. `historial-ediciones.mjs`
// existía desde el 23/07 pero se consultaba en UN solo caso —el arranque en frío de la firma—, así que
// en la corrida normal nadie miraba el historial nunca. Acá se consulta SIEMPRE, en el portón por el que
// pasa toda escritura, y queda en el log: una línea por archivo y por corrida que dice quién lo tocó y
// cuándo. Cuesta una sola llamada por proceso (`historialEdiciones` cachea por fileId).
//
// Qué decide y qué no. El historial de Drive es del ARCHIVO, no de la pestaña: dice "una persona tocó
// este Sheet", no "tocó la celda B7 de CAJA". Bloquear todo el archivo porque el dueño editó una celda
// congelaría el Sheet entero (lo edita todos los días). Entonces el historial no decide: AVISA y obliga
// a mirar. Quien decide pestaña por pestaña son las dos firmas —la de valores y la de formato— que sí
// distinguen qué cambió y dónde.

/** Consulta el historial de versiones y lo deja en el log. Una vez por archivo y por proceso. */
export async function revisarHistorial(cliente, fileId) {
  try {
    const { historialEdiciones, avisoEdicionHumana } = await import('./historial-ediciones.mjs')
    const h = await historialEdiciones(cliente, fileId)
    if (h?.yaAvisado) return h
    if (h?.hubo) console.log(`  📜 ${avisoEdicionHumana(h)}`)
    else if (h?.desconocido) console.log('  📜 historial de versiones no disponible: verifico igual pestaña por pestaña (firma de valores y de formato).')
    h.yaAvisado = true
    return h
  } catch { return { hubo: false, desconocido: true } }
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
export async function evaluarBloqueadas(cliente, fileId, tabs = [], { compartida = false, candar = true } = {}) {
  const bloqueadas = new Set()
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return bloqueadas
  await revisarHistorial(cliente, fileId)
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
      const { editada, noVerificable } = await firmaGuardia(cliente, fileId, t, refDeTab(t), { candar }).catch(() => ({ editada: false, noVerificable: true }))
      // editada = la tocaste; noVerificable = no pude confirmar que está intacta. En ambos casos, no piso.
      if (editada || noVerificable) bloqueadas.add(t)
    }
  } catch { /* fail-closed: ante un fallo del subsistema de firma, no se libera nada nuevo */ }
  return bloqueadas
}

/**
 * ¿De qué pestañas es TUYO el formato? (01/08). Devuelve el conjunto que no se puede re-formatear.
 *
 * Una pestaña protege su formato si está CANDADA, si su CONTENIDO ya está protegido (repintar la
 * geometría de una pestaña que no se pudo reescribir es exactamente el desastre del 31/07: el formato
 * de la grilla nueva sobre los valores viejos), o si su FIRMA DE FORMATO difiere de la que dejó el OS.
 *
 * A diferencia del contenido, un formato protegido NO auto-canda y NO frena los valores: los números
 * se siguen actualizando y lo único que se saltea es la pasada de formato. Es la respuesta literal al
 * pedido —"puedo haber tocado algún número o algún formato y las debe respetar"— sin el efecto lateral
 * de congelar la pestaña entera por un color.
 */
export async function evaluarFormatoProtegido(cliente, fileId, tabs = [], yaProtegidas = new Set()) {
  const protegidas = new Set()
  const protegibles = tabs.filter(esProtegible)
  if (!protegibles.length) return protegidas
  try {
    const { formatoGuardia } = await import('./firma-formato.mjs')
    for (const t of protegibles) {
      if (yaProtegidas.has(t)) { protegidas.add(t); continue }
      const { protegido, motivo } = await formatoGuardia(cliente, fileId, t, refDeTab(t)).catch(() => ({ protegido: true, motivo: 'no pude verificar el formato (fail-closed)' }))
      if (protegido) {
        protegidas.add(t)
        console.log(`  🎨 "${t}": no le toco el formato — ${motivo}. Los números se siguen actualizando.`)
      }
    }
  } catch {
    // Fail-closed: sin el subsistema de firma de formato no se puede saber qué es tuyo → no se formatea.
    for (const t of protegibles) protegidas.add(t)
  }
  return protegidas
}

/**
 * Sella lo que el OS acaba de dejar en la pestaña: la firma de VALORES siempre, y la de FORMATO sólo
 * para las pestañas de `formato` — las que en el momento de decidir NO tenían el formato del dueño.
 *
 * Por qué la de formato es condicional. `USER_ENTERED` deduce el formato de número de lo que se escribe
 * ("$ 1.234" deja la celda en moneda), así que una escritura de VALORES puede mover el formato. Si esa
 * pestaña venía coincidiendo con el sello del OS, el cambio es del OS y hay que resellar (si no, la
 * corrida siguiente lo leería como una edición del dueño y no volvería a formatear nunca). Si el formato
 * ya era del dueño, resellar sería justamente adoptar lo suyo como propio y pisarlo la próxima: no se
 * sella y sigue protegido hasta que él lo diga.
 */
export async function sellarTabs(cliente, fileId, tabs = [], { formato = [] } = {}) {
  const protegibles = tabs.filter(esProtegible)
  // OJO: no cortar acá cuando `tabs` viene vacío. Un batch de SÓLO formato (el caso más común: la pasada
  // de estilo de un generador) no escribe contenido, así que `tabs` es [] — y con el `return` temprano
  // el sello del formato no llegaba a correr nunca. Sin sello no hay referencia, y sin referencia la
  // corrida siguiente vuelve a adoptar y a saltear el formateo: la pestaña no se formateaba más.
  if (protegibles.length) {
    try {
      const { sellarFirma } = await import('./firma-tab.mjs')
      for (const t of protegibles) await sellarFirma(cliente, fileId, t, refDeTab(t)).catch(() => {})
    } catch { /* no crítico */ }
  }
  const conFormato = formato.filter(esProtegible)
  if (!conFormato.length) return
  try {
    const { sellarFormato } = await import('./firma-formato.mjs')
    for (const t of conFormato) await sellarFormato(cliente, fileId, t, refDeTab(t)).catch(() => {})
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
  // El formato se evalúa ANTES de escribir aunque esta escritura sea de valores: `USER_ENTERED` puede
  // mover el formato de número, y sólo se puede resellar el formato de una pestaña que en ESTE momento
  // todavía coincidía con el sello del OS. Después de escribir ya no se puede distinguir su cambio del
  // nuestro. En pestaña compartida no aplica (el OS no es dueño de nada ahí).
  const formatoProtegido = compartida ? new Set() : await evaluarFormatoProtegido(cliente, fileId, tabs, bloqueadas)
  // En una pestaña compartida el OS no es dueño de nada: sellar una firma que la próxima edición de
  // administración va a invalidar sólo fabrica un baseline falso. No se sella.
  const sellarSi = (t) => (compartida
    ? async () => {}
    : () => sellarTabs(cliente, fileId, t, { formato: t.filter((x) => !formatoProtegido.has(x)) }))
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
// spreadsheetBatchUpdate mezcla FORMATO/estructura con requests que escriben CONTENIDO. Se los clasifica
// por tipo y se saca su sheetId.
//
// HASTA EL 01/08 el formato pasaba SIEMPRE ("nunca se bloquea un formateo"). Esa frase era verdadera
// para el dato y falsa para el trabajo del dueño: él pinta celdas, pone formato de moneda y ensancha
// columnas, y eso es trabajo suyo tanto como un número. Ahora hay dos clasificaciones y dos decisiones:
//
//   · CONTENIDO  → se frena si la pestaña está candada o su firma de VALORES cambió.
//   · PRESENTACIÓN → se frena si además su firma de FORMATO cambió (evaluarFormatoProtegido).
//
// Lo que NO se clasifica como presentación y sigue pasando siempre es la ESTRUCTURA que acompaña a una
// escritura de contenido —insertar/borrar filas y columnas, combinar y descombinar—. Frenar a mitad de
// camino un insertDimension que el generador ya contó en sus coordenadas deja la pestaña corrida, que
// es peor que el problema que se quería evitar. La estructura viaja con el contenido y se gobierna con
// la misma decisión que él.

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

/**
 * sheetId del request SI cambia la PRESENTACIÓN de una pestaña (color, tipografía, formato de número,
 * bordes, anchos, congeladas, banding, formato condicional, validación de datos). null si no. Puro.
 *
 * Deliberadamente NO incluye la estructura (insert/deleteDimension, merge/unmergeCells): ver el bloque
 * de arriba. Un `updateCells` o `repeatCell` que trae valor Y formato ya viaja por la clasificación de
 * CONTENIDO, que es la más restrictiva: no se cuenta dos veces.
 */
export function sheetIdDeRequestFormato(req) {
  if (!req || typeof req !== 'object') return null
  if (sheetIdDeRequestContenido(req) != null) return null // lo decide la guarda de contenido
  if (req.repeatCell) return req.repeatCell.range?.sheetId ?? null
  if (req.updateCells) return req.updateCells.range?.sheetId ?? req.updateCells.start?.sheetId ?? null
  if (req.updateBorders) return req.updateBorders.range?.sheetId ?? null
  if (req.updateDimensionProperties) return req.updateDimensionProperties.range?.sheetId ?? null
  if (req.setDataValidation) return req.setDataValidation.range?.sheetId ?? null
  if (req.addConditionalFormatRule) return req.addConditionalFormatRule.rule?.ranges?.[0]?.sheetId ?? null
  if (req.updateConditionalFormatRule) return req.updateConditionalFormatRule.sheetId ?? req.updateConditionalFormatRule.rule?.ranges?.[0]?.sheetId ?? null
  if (req.deleteConditionalFormatRule) return req.deleteConditionalFormatRule.sheetId ?? null
  if (req.addBanding) return req.addBanding.bandedRange?.range?.sheetId ?? null
  if (req.updateBanding) return req.updateBanding.bandedRange?.range?.sheetId ?? null
  if (req.deleteBanding) return null // borrar un banding no pinta nada nuevo; se deja pasar
  if (req.updateSheetProperties) return req.updateSheetProperties.properties?.sheetId ?? null
  if (req.autoResizeDimensions) return req.autoResizeDimensions.dimensions?.sheetId ?? null
  if (req.copyPaste) {
    const pt = String(req.copyPaste.pasteType ?? 'PASTE_NORMAL')
    return /^PASTE_(FORMAT|DATA_VALIDATION|CONDITIONAL_FORMATTING)$/.test(pt) ? (req.copyPaste.destination?.sheetId ?? null) : null
  }
  return null
}

/**
 * Parte los requests en permitidos y bloqueados. `sheetIdsBloqueados` frena el CONTENIDO;
 * `sheetIdsFormato` frena la PRESENTACIÓN. Puro.
 */
export function separarRequests(requests = [], sheetIdsBloqueados = new Set(), sheetIdsFormato = new Set()) {
  const permitidos = []; const bloqueados = []
  for (const r of requests) {
    const sidC = sheetIdDeRequestContenido(r)
    if (sidC != null && sheetIdsBloqueados.has(sidC)) { bloqueados.push(r); continue }
    const sidF = sheetIdDeRequestFormato(r)
    ;(sidF != null && sheetIdsFormato.has(sidF) ? bloqueados : permitidos).push(r)
  }
  return { permitidos, bloqueados }
}

/**
 * Guarda para spreadsheetBatchUpdate: descarta los requests que escriben contenido sobre pestañas
 * candadas/editadas, y los que re-formatean una pestaña cuyo formato es del dueño. Necesita mapear
 * sheetId→pestaña (getSheetMeta).
 * @returns {Promise<{requests:any[], bloqueadas:string[], sellar:() => Promise<void>}>}
 */
export async function guardarRequests(cliente, fileId, requests) {
  const sidsC = [...new Set((requests || []).map(sheetIdDeRequestContenido).filter((s) => s != null))]
  const sidsF = [...new Set((requests || []).map(sheetIdDeRequestFormato).filter((s) => s != null))]
  if (!sidsC.length && !sidsF.length) return { requests, bloqueadas: [], sellar: async () => {} }
  const meta = await cliente.getSheetMeta(fileId)
  const id2tab = new Map(meta.map((m) => [m.sheetId, m.title]))
  const tabsContenido = sidsC.map((s) => id2tab.get(s)).filter(esProtegible)
  const tabsFormato = sidsF.map((s) => id2tab.get(s)).filter(esProtegible)
  const bloqTabs = await evaluarBloqueadas(cliente, fileId, tabsContenido)
  // Las pestañas que sólo reciben formato se evalúan SIN auto-candar: un batch cosmético que pasa por
  // todas las pestañas del archivo no tiene por qué dejar candados sembrados en la base. Su contenido
  // igual se respeta —si su firma de valores cambió, tampoco se la re-formatea—, pero sin efecto lateral.
  const soloFormato = tabsFormato.filter((t) => !tabsContenido.includes(t))
  const bloqSuave = soloFormato.length ? await evaluarBloqueadas(cliente, fileId, soloFormato, { candar: false }) : new Set()
  const contenidoProtegido = new Set([...bloqTabs, ...bloqSuave])
  const fmtTabs = await evaluarFormatoProtegido(cliente, fileId, tabsFormato, contenidoProtegido)
  const escritos = [...new Set(tabsContenido)].filter((t) => !bloqTabs.has(t))
  const formateados = [...new Set(tabsFormato)].filter((t) => !fmtTabs.has(t))
  const sellar = () => sellarTabs(cliente, fileId, escritos, { formato: formateados })
  if (!bloqTabs.size && !fmtTabs.size) return { requests, bloqueadas: [], sellar }
  const bloqSids = new Set([...id2tab].filter(([, t]) => bloqTabs.has(t)).map(([s]) => s))
  const fmtSids = new Set([...id2tab].filter(([, t]) => fmtTabs.has(t)).map(([s]) => s))
  const { permitidos, bloqueados } = separarRequests(requests, bloqSids, fmtSids)
  for (const t of bloqTabs) console.log(`  🔒 "${t}" bajo tu control (candado/edición): salteo escritura(s) de contenido.`)
  void bloqueados
  return { requests: permitidos, bloqueadas: [...new Set([...bloqTabs, ...fmtTabs])], sellar }
}
