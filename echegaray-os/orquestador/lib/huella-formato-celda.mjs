// LA HUELLA DE FORMATO POR CELDA — para que un rango que crece una fila no congele la pestaña.
//
// ═══ EL DEFECTO MEDIDO EL 01/10/2026 EN «OBRAS» ═══
//
// `huella-formato.mjs` indexa la huella por la COORDENADA del request. El formateador de OBRAS manda un
// reset `A1:K120` y encima capas cuyo alto depende de cuántas obras hay (`B10:B18`, `B19:B20`…). Al
// entrar una obra más, las capas pasan a `B10:B19`, `B20:B21`: coordenadas sin huella, con formato
// puesto, y que no coinciden con ningún rango sellado → «ese rango ya tiene un formato que yo no puse».
// Y como las capas que sí entraban cambiaban el interior de `A1:K120`, el reset tampoco: «lo cambiaste
// vos». 65 requests retenidos por corrida desde el 07/09, fechas como 46267, totales sin formato. En el
// formato vivo no había un solo atributo que el OS no produzca: era un candado auto-infligido.
//
// La ampliación del 04/09 («el bloque se corrió de fila») reconoce un bloque que se muda ENTERO; no a
// uno que crece o se achica, porque la huella de un rango de 9 filas nunca es la de uno de 10.
//
// ═══ LA UNIDAD QUE NO CAMBIA CON EL LAYOUT ES LA CELDA ═══
//
// Al sellar se guarda además la huella de CADA celda que cubrió un request aplicado (`tipo = celda1`).
// Un rango nuevo se aplica si cada celda suya está virgen o tiene exactamente el formato que el OS selló
// en ella; la que no, es del dueño (o no se puede probar que no lo sea) y se respeta. Así la prueba de
// autoría sobrevive a cualquier re-particionado del layout, que es lo que la huella por rango no podía.
//
// ═══ EL SELLO PENDIENTE (02/10/2026, auditoría) ═══
//
// Si la relectura posterior al lote o el upsert del sello fallaban, las celdas recién formateadas
// quedaban sin sello y desde ahí se recortaban para siempre como «tuyas»: el mismo candado, ahora por
// celda. Por eso, ANTES de aplicar, se guarda lo que el OS va a dejar en cada celda (`celda1p`,
// predicho en `huella-formato-prediccion.mjs`). Una celda cuyo formato vivo coincide con su sello o
// con su pendiente es del OS: tiene exactamente lo que el OS mandó. Si el pendiente no se puede
// guardar, el lote no se aplica (fail-closed): sin evidencia escrita no se escribe.
//
// ═══ LÍMITES QUE ESTA REGLA NO CUBRE (declarados, no escondidos) ═══
//
// · Un formato del dueño IDÉNTICO al que el OS selló en esa misma celda es indistinguible: se toma
//   como del OS. No hay forma de saberlo mirando el formato.
// · Debajo de la fila TECHO_FILAS_FORMATO (2000) o a la derecha de BZ no se lee: ahí todo cuenta como
//   virgen, y un formato del dueño en esa zona no se protege.
// · Rotación, márgenes internos y link del texto no se leen ni entran al hash: un cambio sólo de eso
//   no se detecta, y un `repeatCell` con máscara completa lo borra.
// · La decisión usa la lectura PREVIA al lote: lo que el dueño edite durante la corrida, entre la
//   lectura y el `batchUpdate`, no se ve.
//
// Este archivo es PURO: sin base ni red. La persistencia vive en `huella-formato-base.mjs`.

import { createHash } from 'node:crypto'
import { letraCol } from './preservar-anotaciones.mjs'
import { normalizarFormatoCelda } from './firma-formato.mjs'

/** El `tipo` con que se guarda en `sheet_huella_formato` el sello de UNA celda. */
export const TIPO_CELDA1 = 'celda1'
/** El `tipo` del sello PENDIENTE: lo que el OS mandó a esa celda, guardado antes de aplicar. */
export const TIPO_CELDA1P = 'celda1p'
/**
 * La marca que deja `formato-resembrar --aplicar` cuando borra SÓLO las huellas de celdas y conserva
 * anchos, altos, merges o pestaña: la corrida siguiente es primera pasada PARA LAS CELDAS y nada más.
 * Sin ella, las huellas que quedan harían que la pestaña no sea virgen y el resembrado no destrabaría
 * nada. Es una decisión de una persona, escrita; el código nunca la pone solo. Se gasta al aplicar.
 */
export const TIPO_RESEMBRAR = 'resembrar'
export const MARCA_RESEMBRAR = `${TIPO_RESEMBRAR}|celdas`

/** Hash corto y estable de cualquier estructura normalizada. Compartido con `huella-formato.mjs`. */
export function hash(x) { return createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16) }

/** A1 de una celda, índices 0-based. */
export function a1DeCelda(fila, col) { return `${letraCol(col)}${fila + 1}` }

/** La huella del formato vivo de una celda. Una celda ausente de la lectura no tiene formato. */
export function huellaDeCelda(lectura, fila, col) {
  return hash(normalizarFormatoCelda(lectura?.filas?.[fila]?.[col]?.formato))
}

/**
 * Las celdas de un GridRange que la lectura alcanza a ver. Las que quedan fuera (debajo del techo de
 * filas, o a la derecha de la última celda que la API devolvió) no tienen formato propio: son vírgenes
 * y no hace falta mirarlas ni sellarlas.
 */
export function celdasDelRango(gr, lectura) {
  const filas = lectura?.filas ?? []
  const f0 = gr?.startRowIndex ?? 0
  const f1 = Math.min(Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : filas.length, filas.length)
  const c0 = gr?.startColumnIndex ?? 0
  const out = []
  for (let f = f0; f < f1; f++) {
    const largo = (filas[f] ?? []).length
    const c1 = Math.min(Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : largo, largo)
    for (let c = c0; c < c1; c++) out.push({ fila: f, col: c })
  }
  return out
}

/**
 * Las celdas del rango que NO se puede probar que sean del OS. PURA.
 *
 * Una celda es del OS si está virgen (sin formato propio) o si su huella viva es la que el OS selló en
 * ELLA. Cualquier otra —con formato y sin sello, o con un sello que no coincide— es del dueño. Sin
 * sellos por celda (una pestaña de antes del 01/10) toda celda con formato cae acá: es la conducta de
 * siempre y no se afloja hasta que alguien resiembre la pestaña a sabiendas.
 *
 * @param {Map<string,string>} sellos A1 → huella sellada
 * @param {Map<string,string>} [memo] A1 → huella viva, para no re-hashear la misma celda por cada capa
 * @param {Map<string,string>} [pendientes] A1 → huella de lo que el OS mandó (sello pendiente)
 * @param {{sinSelloEsMia?:boolean}} [op] `sinSelloEsMia`: el rango entero coincide con su huella, así que
 *   una celda SIN sello ni pendiente la prueba el rango; una CON sello se juzga por su sello.
 */
export function celdasAjenas(lectura, gr, sellos, memo = new Map(), pendientes = new Map(), { sinSelloEsMia = false } = {}) {
  const ajenas = []
  for (const { fila, col } of celdasDelRango(gr, lectura)) {
    if (!lectura.filas[fila]?.[col]?.formato) continue
    const a1 = a1DeCelda(fila, col)
    if (sinSelloEsMia && !sellos.has(a1) && !pendientes.has(a1)) continue
    if (!memo.has(a1)) memo.set(a1, huellaDeCelda(lectura, fila, col))
    const viva = memo.get(a1)
    if (sellos.get(a1) !== viva && pendientes.get(a1) !== viva) ajenas.push({ fila, col })
  }
  return ajenas
}

/** Los tramos de columna de [c0, cFin) que quedan al sacar `excluidas` (ordenadas). `cFin` puede faltar. */
function tramosDeColumna(c0, cFin, excluidas) {
  const out = []
  let desde = c0
  for (const x of excluidas) {
    if (x > desde) out.push([desde, x])
    desde = Math.max(desde, x + 1)
  }
  if (cFin === undefined || cFin > desde) out.push([desde, cFin])
  return out
}

/** Un GridRange sin las claves que quedaron `undefined` (= sin límite, como lo entiende la API). */
function rango(sheetId, f0, f1, c0, c1) {
  const r = { sheetId, startRowIndex: f0, startColumnIndex: c0 }
  if (f1 !== undefined) r.endRowIndex = f1
  if (c1 !== undefined) r.endColumnIndex = c1
  return r
}

/**
 * EL RECORTE: el GridRange partido en rectángulos que cubren todo menos `excluidas`. PURA.
 *
 * Por bandas de filas: las filas consecutivas con las mismas celdas excluidas forman una banda, y cada
 * banda se parte en los tramos de columna que quedan entre ellas. Una celda del dueño en medio de
 * `A1:K120` da cuatro rectángulos, no 1.319. Un borde sin límite (`endRowIndex` ausente) se conserva
 * sin límite en el último rectángulo: lo que estaba debajo de la lectura sigue cubierto.
 *
 * Sólo vale para `repeatCell`, que aplica lo mismo a cada celda: partirlo no cambia lo que hace en
 * ninguna. Un `updateBorders` partido dibujaría bordes internos que el original no tenía.
 */
export function recortarRango(gr, excluidas = []) {
  const f0 = gr?.startRowIndex ?? 0
  const c0 = gr?.startColumnIndex ?? 0
  const fFin = Number.isInteger(gr?.endRowIndex) ? gr.endRowIndex : undefined
  const cFin = Number.isInteger(gr?.endColumnIndex) ? gr.endColumnIndex : undefined
  const porFila = new Map()
  for (const { fila, col } of excluidas) {
    if (!porFila.has(fila)) porFila.set(fila, new Set())
    porFila.get(fila).add(col)
  }
  const bandas = []
  const empujar = (desde, hasta, cols) => {
    if (hasta !== undefined && hasta <= desde) return
    const clave = cols.join(',')
    const ultima = bandas[bandas.length - 1]
    if (ultima && ultima.clave === clave && ultima.hasta === desde) { ultima.hasta = hasta; return }
    bandas.push({ desde, hasta, cols, clave })
  }
  let cursor = f0
  for (const f of [...porFila.keys()].sort((a, b) => a - b)) {
    empujar(cursor, f, [])
    empujar(f, f + 1, [...porFila.get(f)].sort((a, b) => a - b))
    cursor = f + 1
  }
  empujar(cursor, fFin, [])
  return bandas.flatMap((b) => tramosDeColumna(c0, cFin, b.cols).map(([a, z]) => rango(gr.sheetId, b.desde, b.hasta, a, z)))
}

/** Las huellas por celda de lo que cubrieron los rangos aplicados, leídas de la relectura. PURA. */
export function huellasDeCeldas(lectura, rangos = []) {
  const out = new Map()
  for (const gr of rangos) {
    for (const { fila, col } of celdasDelRango(gr, lectura)) {
      const a1 = a1DeCelda(fila, col)
      if (!out.has(a1)) out.set(a1, huellaDeCelda(lectura, fila, col))
    }
  }
  return out
}

/** De todas las huellas de la pestaña, los sellos por celda (A1 → huella) del tipo pedido. */
export function sellosPorCelda(mapa, tipo = TIPO_CELDA1) {
  const out = new Map()
  const prefijo = `${tipo}|`
  for (const [k, h] of mapa ?? []) if (k.startsWith(prefijo)) out.set(k.slice(prefijo.length), h)
  return out
}

/** Las huellas de RANGO de la pestaña, sin coordenada: lo que el OS selló como bloque (ver «se corrió de fila»). */
export function huellasDeRangos(mapa) {
  if (!mapa) return null
  const deCelda = [`${TIPO_CELDA1}|`, `${TIPO_CELDA1P}|`, `${TIPO_RESEMBRAR}|`]
  return new Set([...mapa].filter(([k]) => !deCelda.some((p) => k.startsWith(p))).map(([, h]) => h))
}

/** ¿El GridRange cubre esa celda? Un borde ausente es sin límite. PURA. */
export function cubre(gr, fila, col) {
  return fila >= (gr?.startRowIndex ?? 0) && (!Number.isInteger(gr?.endRowIndex) || fila < gr.endRowIndex)
    && col >= (gr?.startColumnIndex ?? 0) && (!Number.isInteger(gr?.endColumnIndex) || col < gr.endColumnIndex)
}
