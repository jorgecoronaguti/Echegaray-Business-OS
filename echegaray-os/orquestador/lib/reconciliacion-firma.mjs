// LA CAPA DE RECONCILIACIÓN — de "congelar+preguntar" a "entender+reconciliar".
//
// POR QUÉ (25/07). La firma (firma-tab.mjs) es un buen FUSIBLE: detecta CUALQUIER edición del dueño y
// candá la pestaña. Pero después de que salta, el OS sólo sabía candar y pedirle al dueño "elegí qué
// pestañas clavar". Eso no es inteligente: es tercerizarle la decisión. El dueño tiene razón: el fusible
// debe seguir tonto y determinista para ser confiable, PERO lo que pasa DESPUÉS debe entender el cambio.
//
// Esta capa va ARRIBA de la detección, no la reemplaza. Cuando la firma detecta una edición:
//   1. DIFFEA celda por celda: compara lo que hay ahora contra el GRID que el OS dejó (que ahora la
//      firma persiste). Sin grid previo NO adivina: se queda con el candado (fail-closed, igual que hoy).
//   2. CLASIFICA cada celda cambiada:
//        · dato_nuevo        — el dueño cargó un dato donde el OS no tenía nada        → ADOPTAR
//        · formula_corregida — el dueño corrigió/mejoró una fórmula del generador      → APRENDER
//        · override          — el dueño pisó un cálculo con un valor a mano, o borró   → PREGUNTAR
//        · conflicto         — cambió un literal por otro (ambiguo)                    → PREGUNTAR
//   3. ACTÚA:
//        · ADOPTAR/APRENDER → registra la celda como 'activa'. El choke point RE-INYECTA ese valor sobre
//          lo que produce el generador: el generador regenera TODO, pero esa celda conserva lo del dueño.
//          Si TODAS las celdas quedaron resueltas, resella la firma al grid actual y DESCANDA la pestaña:
//          vuelve a mantenerse sola, con las correcciones del dueño protegidas. Autonomía recuperada.
//        · PREGUNTAR → registra la celda como 'pendiente' con UNA pregunta puntual y MANTIENE el candado
//          (fail-closed). No "elegí qué pestañas clavar": "en F12 pisaste tal fórmula con tal número,
//          ¿lo mantengo?".
//
// El NÚCLEO es PURO y se testea sin base ni Sheet: A1↔fila/col, diff, clasificación, plan y re-inyección.
// La orquestación (reconciliar) sólo pega esas piezas con la base y el Sheet, y se llama UNA vez por
// corrida desde el pipeline — nunca desde el choke point, que sigue barato y tonto.

import { leerGridGuardado, sellarFirma } from './firma-tab.mjs'

// ─────────────────────────────────── A1 ↔ fila/col (PURO) ───────────────────────────────────

/** Letras de columna → índice 0-based ("A"→0, "Z"→25, "AA"→26). */
export function colALetraNum(letras) {
  let n = 0
  for (const ch of String(letras).toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) continue
    n = n * 26 + (code - 64)
  }
  return n - 1
}

/** Índice 0-based → letras de columna (0→"A", 26→"AA"). */
export function numALetraCol(n) {
  let s = ''
  for (let x = n; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s
  return s
}

/** A1 (sin pestaña, "F12") → {fila, col} 0-based. Fila ausente ("F") → fila 0. */
export function a1AFilaCol(a1) {
  const m = /^\$?([A-Za-z]+)\$?(\d+)?$/.exec(String(a1).trim())
  if (!m) return null
  return { col: colALetraNum(m[1]), fila: m[2] ? Number(m[2]) - 1 : 0 }
}

/** {fila, col} 0-based → A1 sin pestaña ("F12"). */
export function filaColA1(fila, col) {
  return `${numALetraCol(col)}${fila + 1}`
}

/** La esquina superior-izquierda de un rango A1 → {fila, col} 0-based. Tolera la pestaña y el ":".
 *  "Estructura!F1:H20" → {fila:0, col:5}; "'Cash Flow'!A5" → {fila:4, col:0}; "F1:H20" → {fila:0,col:5}. */
export function inicioDeRango(range) {
  const s = String(range ?? '')
  const bang = s.lastIndexOf('!')
  const cuerpo = bang >= 0 ? s.slice(bang + 1) : s
  const inicio = cuerpo.split(':')[0]
  return a1AFilaCol(inicio)
}

// ─────────────────────────────────── DIFF (PURO) ───────────────────────────────────

/** Normaliza una celda igual que firmaDeGrid (trim), para comparar sin falsos por espacios. */
function norm(v) { return String(v ?? '').trim() }

/**
 * Diff de dos grids (array de filas de celdas). Devuelve SÓLO las celdas que cambiaron, con su A1
 * (relativo a A1 de la pestaña, porque el grid arranca en A1), el valor previo y el actual SIN trimear
 * (para re-inyectar la fórmula/valor exacto del dueño). Compara trimeado para no marcar espacios.
 *
 * @returns {{celda:string, fila:number, col:number, previo:string, actual:string}[]}
 */
export function diffGrids(previo = [], actual = []) {
  const filas = Math.max(previo.length, actual.length)
  const cambios = []
  for (let r = 0; r < filas; r++) {
    const fp = previo[r] || []
    const fa = actual[r] || []
    const cols = Math.max(fp.length, fa.length)
    for (let c = 0; c < cols; c++) {
      const p = fp[c]
      const a = fa[c]
      if (norm(p) === norm(a)) continue
      cambios.push({ celda: filaColA1(r, c), fila: r, col: c, previo: String(p ?? ''), actual: String(a ?? '') })
    }
  }
  return cambios
}

// ─────────────────────────────────── CLASIFICACIÓN (PURA) ───────────────────────────────────

const esFormula = (v) => norm(v).startsWith('=')
const vacio = (v) => norm(v) === ''

export const CAUSAS = { DATO_NUEVO: 'dato_nuevo', FORMULA_CORREGIDA: 'formula_corregida', OVERRIDE: 'override', CONFLICTO: 'conflicto' }
export const ACCIONES = { ADOPTAR: 'adoptar', APRENDER: 'aprender', PREGUNTAR: 'preguntar' }

/**
 * NÚCLEO PURO: clasifica UNA celda cambiada según su valor previo (lo que dejó el OS) y actual (lo que
 * dejó el dueño). Determinístico; sólo el caso literal→literal es genuinamente ambiguo y se marca
 * requiereCerebro para que la orquestación decida si consulta el razonador.
 *
 * @returns {{causa:string, accion:string, requiereCerebro:boolean}}
 */
export function clasificarCeldaPura({ previo, actual }) {
  const pVacio = vacio(previo)
  const aVacio = vacio(actual)
  // El dueño cargó un dato donde el OS no tenía nada → adoptar.
  if (pVacio && !aVacio) return { causa: CAUSAS.DATO_NUEVO, accion: ACCIONES.ADOPTAR, requiereCerebro: false }
  // El dueño borró lo que el OS tenía → decisión deliberada, se confirma (no re-agregar en silencio).
  if (!pVacio && aVacio) return { causa: CAUSAS.OVERRIDE, accion: ACCIONES.PREGUNTAR, requiereCerebro: false }
  // Ambos con contenido:
  const pF = esFormula(previo)
  const aF = esFormula(actual)
  // El dueño dejó una fórmula (corrigió una del generador, o convirtió un literal en fórmula) → aprender.
  if (aF) return { causa: CAUSAS.FORMULA_CORREGIDA, accion: ACCIONES.APRENDER, requiereCerebro: false }
  // El dueño pisó una fórmula del generador con un valor a mano → override deliberado, se confirma.
  if (pF && !aF) return { causa: CAUSAS.OVERRIDE, accion: ACCIONES.PREGUNTAR, requiereCerebro: false }
  // Literal → literal: ambiguo (¿corrección de un dato mal calculado o simple retoque?). Cerebro decide.
  return { causa: CAUSAS.CONFLICTO, accion: ACCIONES.PREGUNTAR, requiereCerebro: true }
}

/** Redacta la pregunta puntual por celda (una sola línea, con la celda y los dos valores). PURA. */
export function preguntaDeCelda(pestana, { celda, previo, actual, causa }) {
  const donde = `${pestana}!${celda}`
  if (causa === CAUSAS.OVERRIDE && vacio(actual)) return `Borraste ${donde} (yo tenía "${previo}"). ¿Lo dejo vacío o lo vuelvo a calcular?`
  if (causa === CAUSAS.OVERRIDE) return `Pisaste ${donde}: yo calculaba "${previo}" y vos pusiste "${actual}". ¿Mantengo tu valor?`
  return `Cambiaste ${donde} de "${previo}" a "${actual}". ¿Es una corrección que debo mantener?`
}

/**
 * NÚCLEO PURO: arma el plan de reconciliación a partir de los diffs. Agrupa por acción. Las celdas
 * marcadas requiereCerebro caen por defecto en 'preguntar' (lado seguro) y además se listan en `dudosas`
 * para que la orquestación pueda re-clasificarlas con el razonador si está disponible.
 *
 * @returns {{aprender:object[], adoptar:object[], preguntar:object[], dudosas:object[]}}
 */
export function planReconciliacion(diffs = [], clasificar = clasificarCeldaPura) {
  const plan = { aprender: [], adoptar: [], preguntar: [], dudosas: [] }
  for (const d of diffs) {
    const { causa, accion, requiereCerebro } = clasificar({ previo: d.previo, actual: d.actual })
    const item = { ...d, causa, accion }
    if (accion === ACCIONES.ADOPTAR) plan.adoptar.push(item)
    else if (accion === ACCIONES.APRENDER) plan.aprender.push(item)
    else plan.preguntar.push(item)
    if (requiereCerebro) plan.dudosas.push(item)
  }
  return plan
}

// ─────────────────────────────────── RE-INYECCIÓN (PURA) ───────────────────────────────────

/**
 * NÚCLEO PURO: re-inyecta los valores APRENDIDOS del dueño sobre UNA entrada de batchUpdateValues
 * ({range, values}). El generador produce su bloque fresco; acá se estampa de vuelta el valor del dueño
 * en las celdas aprendidas que caen dentro del rango escrito. Devuelve una entrada NUEVA (no muta).
 * Sólo estampa celdas que el generador realmente escribe (dentro de values); las que no toca, no hace
 * falta protegerlas en esta escritura.
 *
 * @param {{range:string, values:any[][]}} entrada
 * @param {Map<string,string>} aprendidas  A1 (sin pestaña) → valor del dueño
 */
export function reInyectarEntrada(entrada, aprendidas) {
  if (!entrada || !aprendidas || !aprendidas.size || !Array.isArray(entrada.values)) return entrada
  const inicio = inicioDeRango(entrada.range)
  if (!inicio) return entrada
  let clon = null
  for (const [a1, valor] of aprendidas) {
    const rc = a1AFilaCol(a1)
    if (!rc) continue
    const r = rc.fila - inicio.fila
    const c = rc.col - inicio.col
    if (r < 0 || c < 0 || r >= entrada.values.length) continue
    const fila = entrada.values[r]
    if (!Array.isArray(fila) || c >= fila.length) continue
    if (!clon) clon = { ...entrada, values: entrada.values.map((f) => (Array.isArray(f) ? [...f] : f)) }
    clon.values[r][c] = valor
  }
  return clon || entrada
}

// ─────────────────────────────────── PERSISTENCIA (impura, base) ───────────────────────────────────

async function q(deps) {
  if (deps?.query) return deps.query
  return (await import('./db.mjs')).query
}

/** Registra (upsert) una celda reconciliada. */
export async function registrarCelda(deps, fileId, pestana, celda, { valorDueno = null, valorOs = null, causa, accion, estado = 'activa', pregunta = null } = {}) {
  const query = await q(deps)
  await query(
    `insert into public.sheet_reconciliacion_celda
       (file_id, pestana, celda, valor_dueno, valor_os, causa, accion, estado, pregunta, detectado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (file_id, pestana, celda) do update set
       valor_dueno = excluded.valor_dueno, valor_os = excluded.valor_os, causa = excluded.causa,
       accion = excluded.accion, estado = excluded.estado, pregunta = excluded.pregunta, detectado_en = now()`,
    [fileId, pestana, celda, valorDueno, valorOs, causa, accion, estado, pregunta])
}

/** Las celdas 'activa' de una pestaña como Map(A1 → valor del dueño) — lo que el choke point re-inyecta. */
export async function celdasActivas(deps, fileId, pestana) {
  try {
    const query = await q(deps)
    const { rows } = await query(
      `select celda, valor_dueno from public.sheet_reconciliacion_celda
        where file_id = $1 and pestana = $2 and estado = 'activa'`, [fileId, pestana])
    return new Map(rows.map((r) => [r.celda, r.valor_dueno ?? '']))
  } catch { return new Map() }
}

/** Las preguntas 'pendiente' (de una pestaña o de todo el archivo). Para el reporte/aviso al dueño. */
export async function preguntasPendientes(deps, fileId, pestana = null) {
  try {
    const query = await q(deps)
    const { rows } = pestana
      ? await query(`select pestana, celda, pregunta, causa from public.sheet_reconciliacion_celda where file_id=$1 and pestana=$2 and estado='pendiente' order by celda`, [fileId, pestana])
      : await query(`select pestana, celda, pregunta, causa from public.sheet_reconciliacion_celda where file_id=$1 and estado='pendiente' order by pestana, celda`, [fileId])
    return rows
  } catch { return [] }
}

/** ¿La pestaña está candada por el OS (auto) y no por el dueño? Sólo entonces la reconciliación la descanda. */
async function candadaPorAuto(deps, fileId, pestana) {
  try {
    const { listar } = await import('./pestana-bloqueada.mjs')
    const filas = await listar(deps, fileId)
    const row = filas.find((f) => f.pestana === pestana)
    if (!row) return true // no está candada: se puede seguir (el pipeline igual la va a escribir)
    return row.bloqueada_por === 'auto'
  } catch { return false }
}

// ─────────────────────────────────── ORQUESTACIÓN (impura) ───────────────────────────────────

/**
 * LA RECONCILIACIÓN COMPLETA de una pestaña que la firma marcó editada. Lee el grid previo (baseline) y
 * el actual, diffea, clasifica, persiste y actúa. Se llama UNA vez por corrida desde el pipeline, NO
 * desde el choke point.
 *
 * Fail-closed intacto: sin grid previo (base sin migrar o pestaña que nunca se selló con grid) NO se
 * puede entender el cambio → no resella ni descanda → la pestaña queda candada, igual que hoy, con una
 * pregunta genérica. La capa sólo AGREGA capacidad cuando tiene con qué; nunca debilita la guarda.
 *
 * @returns {Promise<{entendido:boolean, resuelto:boolean, motivo?:string, aprendidas:object[], adoptadas:object[], preguntas:object[]}>}
 */
export async function reconciliar(google, deps, fileId, pestana, { ref = pestana, clasificadorCerebro = null, sellarFn = sellarFirma, permitirDescandar = process.env.ORQ_RECONCILIACION_AUTODESCANDA === '1' } = {}) {
  const sinDatos = { aprendidas: [], adoptadas: [], preguntas: [] }
  const previo = await leerGridGuardado(deps, fileId, pestana)
  if (!previo) {
    return { entendido: false, resuelto: false, motivo: 'sin grid previo: no puedo diffear — la dejo candada y te pregunto', ...sinDatos }
  }
  const actual = await google.readSheetValues(fileId, `${ref}!A1:BZ`, { render: 'FORMULA' }).catch(() => null)
  if (!actual) return { entendido: false, resuelto: false, motivo: 'no pude releer la pestaña', ...sinDatos }

  const diffs = diffGrids(previo, actual)

  // ── LA GUARDA QUE FALTABA (26/07). El dueño perdió su versión OTRA VEZ. Causa: cuando la
  // reconciliación clasificaba TODAS las celdas editadas como "las entiendo", RESELLABA y DESCANDABA
  // sola, y el generador volvía a reescribir la pestaña — en un timer, sin nadie, en loop. Entender una
  // edición y decidir devolverle el control al generador es una decisión del DUEÑO, no de un cron.
  // Por defecto (ORQ_RECONCILIACION_AUTODESCANDA sin poner) NUNCA se descanda solo: si editaste
  // contenido, la pestaña queda EXACTAMENTE como la dejaste (candada por firmaGuardia), no se toca, y
  // se avisa. La reconciliación automática sólo se habilita con la bandera explícita, que hoy no está
  // puesta en ningún lado. La verdad del dueño es definitiva.
  if (diffs.length && !permitirDescandar) {
    return {
      entendido: false, resuelto: false,
      motivo: `editaste ${diffs.length} celda(s): la dejo bajo tu control, no la toco (auto-descanda deshabilitado)`,
      aprendidas: [], adoptadas: [],
      preguntas: [{ celda: diffs[0].celda, pregunta: `Editaste ${diffs.length} celda(s) en "${pestana}". La dejo tal cual y bajo tu control; se regenera sólo si vos la liberás.` }],
    }
  }
  if (!diffs.length) {
    // La firma difería por algo que no es contenido de celda (formato/estructura). Nada que reconciliar:
    // se resella para no arrastrar el mismatch y se descanda si era auto.
    if (await candadaPorAuto(deps, fileId, pestana)) {
      await sellarFn(google, fileId, pestana, ref).catch(() => {})
      try { const { desbloquear } = await import('./pestana-bloqueada.mjs'); await desbloquear(deps, fileId, pestana) } catch { /* no crítico */ }
    }
    return { entendido: true, resuelto: true, motivo: 'sin cambios de contenido', ...sinDatos }
  }

  const plan = planReconciliacion(diffs)

  // Cerebro OPCIONAL: sólo para las celdas genuinamente ambiguas (literal→literal), y sólo si se inyectó
  // un clasificador. Sin él, quedan en 'preguntar' (lado seguro). Es 0-API por defecto.
  if (clasificadorCerebro && plan.dudosas.length) {
    for (const d of plan.dudosas) {
      try {
        const veredicto = await clasificadorCerebro({ pestana, celda: d.celda, previo: d.previo, actual: d.actual })
        if (veredicto && veredicto.accion && veredicto.accion !== ACCIONES.PREGUNTAR) {
          // El cerebro resolvió la ambigüedad: sacarla de 'preguntar' y moverla a su acción.
          const i = plan.preguntar.indexOf(d)
          if (i >= 0) plan.preguntar.splice(i, 1)
          d.causa = veredicto.causa || d.causa
          d.accion = veredicto.accion
          ;(veredicto.accion === ACCIONES.ADOPTAR ? plan.adoptar : plan.aprender).push(d)
        }
      } catch { /* el cerebro falló: la celda se queda en 'preguntar', lado seguro */ }
    }
  }

  // Persistir: adoptar + aprender → 'activa' (se re-inyectan); preguntar → 'pendiente' (candado + pregunta).
  const aprendidas = []
  const adoptadas = []
  for (const it of [...plan.adoptar, ...plan.aprender]) {
    await registrarCelda(deps, fileId, pestana, it.celda, {
      valorDueno: it.actual, valorOs: it.previo, causa: it.causa, accion: it.accion, estado: 'activa',
    }).catch(() => {})
    ;(it.accion === ACCIONES.ADOPTAR ? adoptadas : aprendidas).push(it)
  }
  const preguntas = []
  for (const it of plan.preguntar) {
    const pregunta = preguntaDeCelda(pestana, it)
    await registrarCelda(deps, fileId, pestana, it.celda, {
      valorDueno: it.actual, valorOs: it.previo, causa: it.causa, accion: ACCIONES.PREGUNTAR, estado: 'pendiente', pregunta,
    }).catch(() => {})
    preguntas.push({ ...it, pregunta })
  }

  const resuelto = preguntas.length === 0
  if (resuelto) {
    // TODAS las celdas quedaron protegidas como aprendidas/adoptadas. Se ADOPTA el edit del dueño como
    // nuevo baseline (resella la firma al grid actual) y se DESCANDA: la pestaña vuelve a mantenerse
    // sola. En la próxima escritura, el choke point re-inyecta las celdas aprendidas sobre lo que
    // produzca el generador — regenera todo, respeta las correcciones del dueño.
    if (await candadaPorAuto(deps, fileId, pestana)) {
      await sellarFn(google, fileId, pestana, ref).catch(() => {})
      try { const { desbloquear } = await import('./pestana-bloqueada.mjs'); await desbloquear(deps, fileId, pestana) } catch { /* no crítico */ }
    }
  }
  // Si hay pendientes, NO se resella ni se descanda: la pestaña sigue candada (fail-closed) hasta que el
  // dueño resuelva las preguntas puntuales. Esa parte se comporta igual que hoy — pero ahora con
  // preguntas exactas por celda, no "elegí qué pestañas clavar".

  return { entendido: true, resuelto, aprendidas, adoptadas, preguntas }
}
