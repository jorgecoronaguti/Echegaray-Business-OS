// EL RESUMEN POR CLIENTE DE UNA QUINCENA: ¿LLEGA A TODA LA PLATA QUE HAY CARGADA ARRIBA?
//
// ESTE CONTROL EXISTE PORQUE FALLO EN LA VIDA REAL. En la quincena del 17/08/2026 el resumen busca
// "MESSINAS" y las filas de las personas dicen "MESSINA": la formula devolvio $ 0,00 con $ 1.333.000
// cargados arriba. Y "QUATTROPANI" directamente no tenia fila en el resumen: otros $ 1.152.000
// invisibles. El 37% de la quincena no llegaba al total, sin un solo error a la vista.
//
// TODO ACA ES PURO: entra la grilla que devolvio readSheetGrid y el mapa de clientes; sale la
// estructura. Vive aparte de jornales-por-obra.mjs porque son dos preguntas distintas -cuanto costo
// cada obra, y si el resumen de la planilla la esta sumando- y ninguno de los dos archivos tiene
// que crecer hasta que no se lea.
//
// LAS TRES COSAS QUE ESTE ARCHIVO APRENDIO A LOS GOLPES
//
// 1. LA COORDENADA DE UNA FORMULA ES DE LA HOJA, NO DE LA GRILLA. "V552" es la fila 552 del Sheet;
//    si el rango leido arranca en la fila 401, esa fila es el indice 151. Sin restar el offset, el
//    control miraba 400 filas mas arriba, no encontraba nada, e informaba "todo limpio" sobre la
//    misma planilla rota que con offset 0 si delataba.
// 2. UN SOLO BLOQUE POR VEZ. Sin limite, la auditoria de una quincena barria hasta el final de la
//    hoja y reportaba como huerfano a todo cliente de las 13 quincenas de abajo. El limite es
//    obligatorio: o se pasa `hastaFila`, o se pasan los bloques y se deriva del siguiente.
// 3. UN HUERFANO NO ES UNA SOLA COSA. "MESSINAS" mal escrito con plata arriba es un DEFECTO;
//    "ARCOR" bien escrito sin nadie trabajando es un ESTADO. Mezclados, el defecto se ahoga entre
//    tres o cuatro clientes sin actividad y nadie lo mira.

import {
  normalizarClave, trabajadoresDeBloque, letraColumna, indiceColumna,
  colSheet, filaSheet, filaGrid, colGrid,
} from './jornales-estructura.mjs'
import { columnasDeDinero, resolverCliente, CLASE } from './jornales-por-obra.mjs'

/** Llamada a SUMIF/SUMIFS en cualquier parte de la formula — tambien anidada dentro de un IFERROR. */
const RE_LLAMADA_SUMIFS = /(^|[^A-Za-z0-9_.$])(SUMIFS?)\s*\(/i

/** ¿Esta formula contiene un SUMIFS, aunque sea adentro de otra funcion? */
export const tieneSumifs = (f) => typeof f === 'string' && RE_LLAMADA_SUMIFS.test(f)

/**
 * NUCLEO PURO: los argumentos de la PRIMERA llamada a SUMIF/SUMIFS de la formula.
 *
 * Se parsea de verdad -parentesis balanceados y comillas- porque partir por `;` a lo bruto rompe
 * con cualquier anidado. El caso real: `=IFERROR(SUMIFS(AA1:AA20;AB1:AB20;V552);0)`. Tomando los
 * argumentos del parentesis EXTERNO, el ultimo es `0` y el control se saltea la fila informando
 * limpio; una fila de resumen envuelta en IFERROR era invisible.
 *
 * Devuelve null cuando no hay SUMIFS o los parentesis no cierran: eso es "no lo entiendo", que se
 * declara, y nunca "no hay nada".
 */
export function argumentosDeSumifs(formula) {
  const f = String(formula ?? '')
  const m = RE_LLAMADA_SUMIFS.exec(f)
  if (!m) return null
  const args = []
  let actual = ''
  let nivel = 1
  let enComillas = false
  for (let i = f.indexOf('(', m.index + m[1].length) + 1; i < f.length; i++) {
    const ch = f[i]
    if (enComillas) { actual += ch; if (ch === '"') enComillas = false; continue }
    if (ch === '"') { enComillas = true; actual += ch; continue }
    if (ch === '(') nivel++
    else if (ch === ')') {
      nivel--
      if (nivel === 0) { args.push(actual); return args }
    } else if ((ch === ';' || ch === ',') && nivel === 1) { args.push(actual); actual = ''; continue }
    actual += ch
  }
  return null
}

const RE_REFERENCIA = /^\$?([A-Z]+)\$?(\d+)$/i
const RE_RANGO = /^\$?([A-Z]+)\$?\d*(?::\$?([A-Z]+)\$?\d*)?$/i

/**
 * NUCLEO PURO: que usa este SUMIFS como CRITERIO — que celda, o que texto literal.
 *
 * POR QUE NO SE MIRA "LA CELDA DE AL LADO". Es lo primero que uno escribe y es falso: en el archivo
 * real el rotulo esta en V552 y la formula en X552 -hay una columna vacia en el medio-, asi que
 * buscar en j-1 no encontraba nada y el control informaba "ningun huerfano" sobre una planilla que
 * tenia uno. La formula, en cambio, dice exactamente cual es el criterio:
 * =SUMIFS(AA527:AA544;AB527:AB544;V552) -> V552. Eso es derivar de la planilla en vez de suponer.
 *
 * Con `letraCriterio` se elige el criterio del PAR cuyo rango es esa columna (el SUMIFS admite
 * varios pares rango/criterio y el ultimo no tiene por que ser el del cliente). Si ese par no
 * aparece, devuelve null: no se agarra otro criterio de rebote.
 *
 * Devuelve { fila1, col } en coordenadas de HOJA (fila 1-based, columna 0-based), o
 * { literal } cuando el criterio esta escrito entre comillas, o null.
 */
export function celdaDelCriterio(formula, { letraCriterio = null } = {}) {
  const args = argumentosDeSumifs(formula)
  if (!args || args.length < 3) return null
  let crit = null
  if (letraCriterio) {
    for (let k = 1; k + 1 < args.length; k += 2) {
      const r = RE_RANGO.exec(args[k].trim())
      if (r && r[1].toUpperCase() === String(letraCriterio).toUpperCase()) { crit = args[k + 1]; break }
    }
    if (crit == null) return null
  } else crit = args[args.length - 1]

  const t = String(crit).trim()
  const lit = /^"(.*)"$/s.exec(t)
  if (lit) return { literal: lit[1].trim() }
  const m = RE_REFERENCIA.exec(t)
  if (!m) return null
  const col = indiceColumna(m[1].toUpperCase())
  const fila1 = Number(m[2])
  if (col == null || !Number.isInteger(fila1) || fila1 < 1) return null
  return { fila1, col }
}

/**
 * Hasta que fila de la grilla llega ESTE bloque. Obligatorio a proposito: sin limite, auditar la
 * primera quincena de una pestaña con 14 bloques apilados leia los resumenes de las otras 13 y
 * reportaba como huerfano a QUATTROPANI, que es cliente de otra quincena y esta perfecto.
 */
export function limiteDelBloque(grid, bloque, { hastaFila = null, bloques = null } = {}) {
  const n = (grid?.filas || []).length
  if (Number.isInteger(hastaFila)) return Math.min(hastaFila, n)
  if (Array.isArray(bloques)) {
    const siguientes = bloques.map((b) => b.fila).filter((f) => f > bloque.fila).sort((a, b) => a - b)
    return Math.min(siguientes[0] ?? n, n)
  }
  throw new Error(
    'auditarResumenPorCliente: falta el limite del bloque. Pasá `hastaFila` o `bloques`: sin limite '
    + 'se leen los resumenes de las quincenas de abajo y todo cliente de otra quincena sale huerfano.',
  )
}

/** Los rotulos de cliente que USAN las filas de personas del bloque, con su plata segun la propia
 *  planilla (la celda de total de cada fila, que es un numero que el Sheet ya calculo). */
function clientesEnFilas(grid, bloque, fin) {
  const enFilas = new Map()
  for (const t of trabajadoresDeBloque(grid, bloque, { hastaFila: fin })) {
    const clave = normalizarClave(t.cliente_original)
    if (!clave) continue
    const fila = grid.filas?.[t.fila] || []
    const { colTotal } = columnasDeDinero(fila)
    const jornal = colTotal == null ? null : fila[colTotal]?.numero
    const e = enFilas.get(clave) ?? { clave, rotulo: t.cliente_original.trim(), filas: [], jornal: 0, completo: true }
    e.filas.push({ persona: t.nombre_original, fila: t.fila1 })
    if (typeof jornal === 'number' && Number.isFinite(jornal)) e.jornal += jornal
    else e.completo = false
    enFilas.set(clave, e)
  }
  return enFilas
}

/** Lee el rotulo que un SUMIFS usa como criterio. Devuelve el texto, o el motivo por el que no se
 *  pudo leer — que NO es lo mismo que "no hay rotulo" y por eso se informa aparte. */
function rotuloDeFormula(grid, formula, letraCliente) {
  const ref = celdaDelCriterio(formula, { letraCriterio: letraCliente })
  if (ref == null) return { motivo: 'criterio_no_resuelto' }
  if (ref.literal != null) {
    return ref.literal ? { rotulo: ref.literal } : { motivo: 'criterio_vacio' }
  }
  const i = filaGrid(grid, ref.fila1)
  const j = colGrid(grid, ref.col)
  if (i == null || j == null || i >= (grid.filas?.length ?? 0)) return { motivo: 'criterio_fuera_del_rango', ref }
  const celda = grid.filas[i]?.[j]
  const texto = celda?.valor == null ? '' : String(celda.valor).trim()
  if (!texto) return { motivo: 'criterio_vacio', ref }
  return { rotulo: texto, ref }
}

/** Barre las filas del bloque juntando UNA fila de resumen por renglon (la primera que mira la
 *  columna CLIENTE). Separa lo que se pudo leer de lo que no. */
function rotulosDelResumen(grid, bloque, fin) {
  const filas = grid?.filas || []
  const colCliente = bloque?.columnas?.cliente
  const letraCliente = colCliente == null ? null : letraColumna(colSheet(grid, colCliente))
  const rotulos = []
  const noLegibles = []
  for (let i = bloque.fila + 1; i < fin; i++) {
    const fila = filas[i] || []
    for (let j = 0; j < fila.length; j++) {
      const f = fila[j]?.formula
      if (!tieneSumifs(f)) continue
      // La formula tiene que mirar la columna CLIENTE: si no, es cualquier otro SUMIFS del bloque.
      // OJO CON EL LIMITE DE PALABRA: /\bAB\b/ NO matchea "AB527:AB544", porque despues de la B
      // viene un digito, que tambien es caracter de palabra. Con esa version el control no
      // encontraba NUNCA el resumen y devolvia "todo limpio" sobre una planilla rota.
      if (letraCliente && !new RegExp(`(^|[^A-Za-z])\\$?${letraCliente}\\$?\\d`, 'i').test(f)) continue
      const formulaEn = `${letraColumna(colSheet(grid, j))}${filaSheet(grid, i)}`
      const r = rotuloDeFormula(grid, f, letraCliente)
      if (r.rotulo == null) { noLegibles.push({ formulaEn, motivo: r.motivo, formula: f }); break }
      rotulos.push({
        rotulo: r.rotulo,
        clave: normalizarClave(r.rotulo),
        fila: r.ref ? r.ref.fila1 : filaSheet(grid, i),
        columna: letraColumna(r.ref ? r.ref.col : colSheet(grid, j)),
        formulaEn,
      })
      break
    }
  }
  return { rotulos, noLegibles }
}

/**
 * Parte los rotulos que ninguna fila usa en los dos casos que NO son lo mismo:
 *   · error de ortografia: alguna fila resuelve al MISMO cliente canonico bajo otro rotulo. Es el
 *     defecto — la formula da cero para siempre y hay plata cargada arriba.
 *   · sin actividad: el rotulo resuelve bien y nadie trabajo para ese cliente. Es un estado.
 * Lo que el mapa no puede resolver queda en `huerfanos`, sin clasificar: falla cerrado.
 */
function clasificarHuerfanos(huerfanos, enFilas, mapa) {
  const porCanonico = new Map()
  for (const [clave, e] of enFilas) {
    const r = resolverCliente(e.rotulo, mapa)
    if (r.clase !== CLASE.CLIENTE) continue
    if (!porCanonico.has(r.cliente)) porCanonico.set(r.cliente, [])
    porCanonico.get(r.cliente).push({ clave, ...e })
  }
  const erroresDeRotulo = []
  const sinActividad = []
  const sinClasificar = []
  for (const h of huerfanos) {
    const r = resolverCliente(h.rotulo, mapa)
    if (r.clase !== CLASE.CLIENTE) { sinClasificar.push({ ...h, clase: r.clase }); continue }
    const otras = (porCanonico.get(r.cliente) ?? []).filter((e) => e.clave !== h.clave)
    if (!otras.length) { sinActividad.push({ ...h, cliente: r.cliente }); continue }
    erroresDeRotulo.push({
      ...h,
      cliente: r.cliente,
      rotuloEnFilas: otras.map((o) => o.rotulo),
      filas: otras.flatMap((o) => o.filas),
      // Plata que la formula NO esta sumando, segun los totales que la propia planilla calculo.
      // null cuando alguna fila no tiene total legible: un parcial presentado como total miente.
      jornalEscondido: otras.every((o) => o.completo) ? otras.reduce((a, o) => a + o.jornal, 0) : null,
    })
  }
  return { erroresDeRotulo, sinActividad, sinClasificar }
}

/**
 * ¿El resumen por cliente que la planilla calcula sola llega a todos los clientes cargados?
 *
 * Devuelve, separados: `erroresDeRotulo` (defecto con plata escondida), `sinActividad` (estado),
 * `huerfanos` (lo que el mapa no resuelve: no se clasifica ni se descarta), `faltantes` (clientes
 * cargados que el resumen ni siquiera busca) y `noLegibles` (formulas que no se pudieron leer).
 */
export function auditarResumenPorCliente(grid, bloque, { hastaFila, bloques, mapa } = {}) {
  const fin = limiteDelBloque(grid, bloque, { hastaFila, bloques })
  const enFilas = clientesEnFilas(grid, bloque, fin)
  const { rotulos, noLegibles } = rotulosDelResumen(grid, bloque, fin)
  const claves = new Set(rotulos.map((r) => r.clave))
  const huerfanos = rotulos.filter((r) => !enFilas.has(r.clave))
  const { erroresDeRotulo, sinActividad, sinClasificar } = clasificarHuerfanos(huerfanos, enFilas, mapa)
  return {
    verificable: mapa?.leido === true,
    rotulos,
    noLegibles,
    erroresDeRotulo,
    sinActividad,
    huerfanos: sinClasificar,
    faltantes: [...enFilas.values()]
      .filter((e) => !claves.has(e.clave))
      .map((e) => ({ clave: e.clave, rotulo: e.rotulo, jornal: e.completo ? e.jornal : null })),
  }
}
