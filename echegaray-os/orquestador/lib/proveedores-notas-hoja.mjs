// LA COLUMNA «QUÉ HACER» DE PROVEEDORES, LEÍDA DEL SHEET — qué escribió o borró el dueño a mano.
//
// ═══ CÓMO ESTÁ HECHA LA COLUMNA (leído del archivo real el 17/09/2026) ═══
//
// En el cuadro «a quién se le debe» la D NO guarda texto: cada fila lleva
// `=IF($A18="";"";IFERROR(VLOOKUP($A18;'_PROVEEDORES_OS'!$A:$C;3;FALSE);""))`, y la nota vive en la
// auxiliar oculta, que `proveedores-cuenta-corriente.mjs` reescribe desde `public.proveedor_notas`.
// Cuando el dueño escribe en la D, pisa la fórmula con su texto. Hasta hoy nada leía esa edición: la
// corrida siguiente de `proveedores-dos-cuadros.mjs` vaciaba A:G y reponía la fórmula, y el texto del
// dueño se perdía sin aviso.
//
// ═══ LA EVIDENCIA ES LA FORMA DE LA CELDA, NO SU VALOR ═══
//
// Se lee dos veces el mismo rango: el valor que se ve y la fórmula. Una fórmula es eco del OS y no
// dice nada. Un TEXTO donde el OS puso una fórmula es una edición del dueño. Una celda VACÍA sin
// fórmula al lado de un proveedor es un borrado… sólo si en la lectura anterior ESA fila tenía la
// fórmula o su texto y ESE MISMO proveedor. Mirando sólo el valor, una nota visible y una borrada son
// indistinguibles del lado de quien no la escribió: así destruyó diez notas el discriminador del
// 31/07, que leía «celda vacía» donde las notas estaban a la vista.
//
// ═══ LA DINÁMICA SE REORDENA SOLA, Y EL TEXTO DEL DUEÑO NO SE MUEVE CON ELLA ═══
//
// El cuadro es una tabla dinámica ordenada por monto: cuando Compras cambia, los proveedores suben y
// bajan de fila y un texto escrito a mano se queda en su renglón, al lado de OTRO proveedor. Guardarlo
// a nombre del de al lado es el defecto que este archivo ya pagó tres veces. Por eso la lectura
// anterior (`anterior`) guarda de quién era cada texto: si el mismo texto está ahora al lado de otro
// proveedor, se movió la dinámica, no el dueño — se informa y no se guarda.
//
// ═══ UN BLOQUE SIN NINGUNA FÓRMULA ES UN GENERADOR A MITAD DE CAMINO ═══
//
// `proveedores-dos-cuadros.mjs` vacía A:G, ancla la dinámica y recién después repone las fórmulas.
// Una lectura en ese hueco ve nombres al lado de celdas vacías sin fórmula: todas las notas parecerían
// borradas a la vez. Si el bloque no tiene ni una fórmula, no se concluye nada y la lectura anterior
// se conserva.
//
// La regla de qué se guarda y qué se borra es la de siempre, `conciliarNotas`: acá sólo se arma su
// evidencia. Núcleo puro: no lee Google ni la base.

import { claveProv, conciliarNotas } from './proveedor-notas.mjs'
import { geometriaDeLaSeccion } from './proveedores-pivot-seccion1.mjs'
import { COL_PROVEEDOR, colNota, rangoDelCuadroA } from './proveedores-cuadro-a.mjs'
import { esSubtituloDeDetalle, subtituloDetalle } from './proveedores-titulos.mjs'

/** El rango que se lee dos veces (valor y fórmula). El mismo que usan los dos escritores de la columna. */
export const RANGO_PROVEEDORES = 'Proveedores!A1:R220'

/** Más borrados que esto en UNA lectura no son una decisión del dueño: se retienen y se informan. */
export const TOPE_BORRADOS = 2

/** Filas de colchón bajo el cuadro: las mismas que prepara `proveedores-notas-visibles.mjs`. */
const COLCHON = 4

const texto = (v) => String(v ?? '').trim()

/** Qué forma tiene la celda: fórmula del OS, texto escrito a mano o vacía. */
export function formaDeCelda(formula) {
  const f = String(formula ?? '')
  if (f.startsWith('=')) return { tipo: 'formula', texto: '' }
  return texto(f) ? { tipo: 'texto', texto: texto(f) } : { tipo: 'vacia', texto: '' }
}

/**
 * Las filas del cuadro con su proveedor y la forma de su nota.
 * @param {{visible:any[][], formulas:any[][]}} o el mismo rango leído con FORMATTED_VALUE y con FORMULA
 * @returns {{filas:Array<{fila:number, proveedor:string, clave:string, tipo:string, texto:string}>, formulas:number}}
 */
export function observarCuadro({ visible = [], formulas = [] }) {
  const geo = geometriaDeLaSeccion(visible)
  const iSub = visible.findIndex((f, i) => i >= geo.filaEncabezado && esSubtituloDeDetalle(f?.[0]))
  if (iSub < 0) throw new Error(`no encontré el subtítulo "${subtituloDetalle()}": sin tope no leo notas`)
  const { desde, hasta } = rangoDelCuadroA({ visible, filaRotulos: geo.filaEncabezado, filaTope: iSub + 1, colchon: COLCHON })
  const col = colNota()
  const filas = []
  let conFormula = 0
  for (let fila = desde; fila < hasta; fila++) {
    const forma = formaDeCelda(formulas[fila - 1]?.[col])
    if (forma.tipo === 'formula') conFormula++
    const proveedor = texto(visible[fila - 1]?.[COL_PROVEEDOR])
    filas.push({ fila, proveedor, clave: claveProv(proveedor), ...forma })
  }
  return { filas, formulas: conFormula }
}

/** ¿Este texto ya está guardado como nota de OTRO proveedor? Sólo se usa sin lectura anterior. */
const esNotaDeOtro = (enBase, clave, t) => [...enBase].some(([k, v]) => k !== clave && v?.nota === t)

/**
 * LA EVIDENCIA DE LO QUE HIZO EL DUEÑO, y lo que `conciliarNotas` decide con ella.
 *
 * @param {object} o
 * @param {{filas:Array, formulas:number}} o.observacion  la de `observarCuadro`
 * @param {Map<number,{clave:string,tipo:string,texto:string}>|null} o.anterior  la lectura anterior, por fila
 * @param {Map<string,{proveedor:string,nota:string}>} o.enBase  `leerNotas`
 * @returns {{guardar:Array, borrar:string[], retenidos:string[], desplazadas:Array, sinEvidencia:string|null,
 *            siguiente:Map<number,object>}}
 */
export function edicionesDelDueno({ observacion, anterior = null, enBase = new Map() }) {
  const { filas, formulas } = observacion
  if (formulas === 0 && filas.some((f) => f.clave)) {
    return {
      guardar: [], borrar: [], retenidos: [], desplazadas: [], siguiente: anterior ?? new Map(),
      sinEvidencia: 'el cuadro no tiene ni una fórmula en «Qué hacer»: un generador lo está rehaciendo, no concluyo nada',
    }
  }
  const enPestana = new Map(); const presentes = new Set(); const escritasAntes = new Set()
  const grafia = new Map(); const desplazadas = []; const siguiente = new Map()
  for (const f of filas) {
    const prev = anterior?.get(f.fila)
    // De quién es un texto: del proveedor que tenía al lado cuando apareció, no del que tiene hoy.
    const movido = f.tipo === 'texto' && prev?.tipo === 'texto' && prev.texto === f.texto && prev.clave !== f.clave
    siguiente.set(f.fila, { clave: movido ? prev.clave : f.clave, tipo: f.tipo, texto: f.texto })
    if (!f.clave || f.tipo === 'formula') continue
    if (f.tipo === 'texto') {
      if (enBase.get(f.clave)?.nota === f.texto) continue
      if (movido || (!anterior && esNotaDeOtro(enBase, f.clave, f.texto))) {
        desplazadas.push({ fila: f.fila, proveedor: f.proveedor, texto: f.texto, de: movido ? prev.clave : null })
        continue
      }
      enPestana.set(f.clave, f.texto); presentes.add(f.clave); grafia.set(f.clave, f.proveedor)
      continue
    }
    // Vacía sin fórmula: es un borrado sólo si en la lectura anterior esta fila era de ESTE proveedor
    // y mostraba algo (la fórmula o un texto suyo).
    const mostrabaAlgo = prev && prev.clave === f.clave && (prev.tipo === 'formula' || (prev.tipo === 'texto' && prev.texto))
    if (!mostrabaAlgo) continue
    enPestana.set(f.clave, ''); presentes.add(f.clave); escritasAntes.add(f.clave)
  }
  const { guardar, borrar } = conciliarNotas(enPestana, enBase, presentes, escritasAntes)
  const excede = borrar.length > TOPE_BORRADOS
  return {
    guardar: guardar.map((g) => ({ ...g, proveedor: grafia.get(g.clave) ?? g.clave })),
    borrar: excede ? [] : borrar,
    retenidos: excede ? borrar : [],
    desplazadas,
    sinEvidencia: null,
    siguiente,
  }
}

/** La lectura anterior se guarda como JSON: Map ↔ pares. */
export const anteriorAJson = (m) => (m ? [...m.entries()] : null)
export const anteriorDeJson = (pares) => (Array.isArray(pares) ? new Map(pares) : null)
