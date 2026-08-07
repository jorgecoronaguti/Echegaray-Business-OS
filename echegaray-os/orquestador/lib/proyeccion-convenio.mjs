// LA MASA SALARIAL PROYECTADA DE OBRA SE VALÚA AL 100% DEL CONVENIO — LA ORDEN Y SU MECÁNICA.
//
// ═══ LA ORDEN (07/08/2026, textual) ═══
//
// El dueño: *"quiero q realices la proyeccion de las quincenas futuras de los obreros considerando que
// se paga el 100% de lo q indica la hora del convenio. este es un trabajo en pestaña jornales por
// quincena"*. Y al ratito, sobre el alcance: *"esto puede impactar en varias pestañas a la vez, tener
// en cuenta y hacer las proyecciones"*.
//
// ═══ QUÉ CAMBIA, EXACTAMENTE — LA BASE, NO EL DRIVER ═══
//
// Hasta hoy la proyección de obra escalaba la Σ $/hora PACTADA —lo que efectivamente pagamos, columna
// W del espejo `_J_OBREROS`— por el factor de la paritaria UOCRA. Medido el 07/08: el plantel pactado
// suma $85.900/hora y está entre 14,9% y 16,7% POR DEBAJO de la escala Zona A. Proyectar sobre el
// pactado contesta *"cuánto va a costar seguir pagando lo que pagamos"*. El dueño pidió la otra
// pregunta: *"cuánto cuesta pagar la escala"*.
//
// La base pasa a ser Σ (personas de la categoría × hora de escala de ESA categoría) y sobre esa base
// se aplica EL MISMO factor de paritaria que ya gobierna los tres bloques de la pestaña. El driver de
// escalación no se toca: lo que cambia es la BASE que se escala. Con el plantel del 07/08 —4 OF, 2 A,
// 2 A M, 8 OF M, y la equivalencia declarada por el dueño (OF y OF M→Oficial · A y A M→Ayudante)— eso
// es 12 × $6.348 + 4 × $5.399 = $97.772/hora a valores de agosto 2026.
//
// ═══ ES UN SUPUESTO, Y VIAJA DICHO ═══
//
// Hoy NO se paga el convenio. La proyección al 100% es una HIPÓTESIS del dueño, no el jornal vigente:
// si la pestaña no lo dijera, el número se leería como "esto es lo que vamos a pagar" cuando en verdad
// es "esto es lo que costaría cumplir la escala". Por eso `lineaSupuestoConvenio` se escribe arriba del
// cuadro y no en un comentario del código, que nadie abre. El bloque 1.1 —pactado contra convenio,
// categoría por categoría— NO se toca: esa comparación sigue siendo un HECHO, y es justamente la que
// prueba que el supuesto no es gratis.
//
// ═══ POR QUÉ SALE POR FÓRMULA Y NO COMO NÚMERO PEGADO ═══
//
// La Σ del convenio se arma con las dos columnas que el bloque 1.1 YA publica: «Personas»
// (`COUNTIFS` sobre la columna D del espejo) y «Básico convenio» (`INDEX/MATCH` sobre la réplica viva
// `_UOCRA_RAW`). Un SUMPRODUCT de esas dos columnas se mueve solo el día que entra un obrero, que
// alguien le cambia la categoría en la planilla del dueño, o que se pega un acuerdo nuevo. Pegar
// $97.772 en una celda habría dado el número correcto hoy — y el número de hoy para siempre.
//
// ═══ QUIÉN HEREDA ESTE CAMBIO, Y POR QUÉ NO HAY QUE TOCAR NADA MÁS ═══
//
// La base nueva entra en la columna «Σ $/hora convenio» del cuadro 1.2, de ahí a la columna
// «Proyectado» de 1.3, y ésa es la que publica el rango con nombre `JORNALES_PROY_TOTAL`. Todo lo de
// aguas abajo lee ESE nombre y ninguno recalcula la masa por su cuenta — verificado por grep el 07/08:
//
//   · Cargas Sociales → `jornalesDelMes()` en lib/cargas-cadena.mjs. Las cargas son un % de la
//     remuneración: si sube la masa proyectada, suben con ella y sin tocar una línea.
//   · Libro / _MOVIMIENTOS → scripts/libro-movimientos-pestana.mjs, y de ahí CAJA, las tarjetas y el
//     portón.
//   · Cash Flow → lib/cash-flow-lineas.mjs · Resumen → scripts/resumen-pestana.mjs · el calendario de
//     egresos y la conciliación caja-vs-cashflow.
//
// Es la regla de REALIDAD ÚNICA: la masa salarial proyectada de obreros se define UNA sola vez —acá— y
// el resto la hereda por rango con nombre. Ninguna pestaña necesita una celda nueva.

import { sub } from './patron-pestana.mjs'
import { convenioDe, CONVENIO_POR_CODIGO } from './uocra-paritaria.mjs'

/**
 * EL SUPUESTO VIAJA CON EL NÚMERO A LA PESTAÑA QUE LO MULTIPLICA.
 *
 * Cargas Sociales no muestra la masa: la multiplica. Su «Remuneración proyectada» es jornales × la
 * relación declarado/neto, y sobre eso corren contribuciones, IERIC, FODECO y FCL. O sea que el
 * supuesto del 100% del convenio COMPUESTO llega hasta la última fila de esa pestaña — y hasta hoy
 * estaba declarado sólo en Jornales, dos pestañas más allá. Una limitación declarada en otro lado no
 * está declarada.
 *
 * Se define UNA vez acá y se importa: dos redacciones del mismo supuesto envejecen distinto.
 */
export const NOTA_SUPUESTO_CONVENIO = 'La parte PROYECTADA de esos jornales viene valuada al 100% de '
  + 'la hora de convenio UOCRA por categoría (supuesto del dueño — ver Jornales por Quincena 1.2). Hoy '
  + 'se paga por debajo de la escala: esto es lo que costaría cumplirla, no lo que se viene pagando.'

/** Columna del espejo `_J_OBREROS` donde vive el código de categoría (0-based). Es la D. */
const COL_CATEGORIA = 3
/** Columna del espejo donde vive el nombre. Una fila sin nombre no es una persona. */
const COL_NOMBRE = 1

/**
 * NÚCLEO PURO: la expresión (sin `=`) de la Σ $/hora del plantel VALUADA AL CONVENIO.
 *
 * Son las dos columnas del bloque 1.1: B = personas de la categoría (COUNTIFS sobre el espejo) y
 * F = básico del convenio de esa categoría (INDEX/MATCH sobre la réplica). El producto escalar de las
 * dos ES la masa por hora a escala plena, y las dos son fórmulas vivas: nada acá queda congelado.
 *
 * SUMPRODUCT y no una suma de productos fila por fila: el bloque tiene tantas filas como categorías
 * traiga el espejo, y ese número lo decide la planilla del dueño, no este código.
 *
 * @param {number} fPrimera primera fila de categorías del bloque 1.1
 * @param {number} fUltima  última
 * @returns {string|null} null si el bloque no tiene filas — no hay Σ que armar
 */
export function formulaSigmaConvenio(fPrimera, fUltima) {
  if (!(fPrimera > 0) || !(fUltima >= fPrimera)) return null
  return `SUMPRODUCT($B$${fPrimera}:$B$${fUltima};$F$${fPrimera}:$F$${fUltima})`
}

/**
 * NÚCLEO PURO: LA LÍNEA QUE DICE EN LA PESTAÑA QUE LO DE ABAJO ES UN SUPUESTO.
 *
 * Un número que se lee como un hecho y es una hipótesis es peor que no tenerlo: acá abajo hay diez
 * quincenas valuadas a una escala que hoy NO se paga, y el que mire el total tiene que saberlo en el
 * mismo renglón, no tres pestañas más allá.
 *
 * Y ES ADEMÁS EL CANARIO. Si la réplica `_UOCRA_RAW` se cayó, las celdas «Básico convenio» del bloque
 * 1.1 devuelven vacío, el SUMPRODUCT da 0 y la proyección entera se iría a $0 sin un solo error — el
 * modo de falla favorito de este libro. La misma celda que declara el supuesto lo detecta, porque
 * evalúa la Σ real y no una copia suya.
 *
 * @param {string|null} sigma expresión de la Σ al convenio, o null si no se pudo armar
 * @param {string} celdaPersonas celda con el total de personas del plantel base
 * @returns {string} la fórmula (o el texto) para la columna A
 */
export function lineaSupuestoConvenio({ sigma = null, celdaPersonas = null } = {}) {
  // SIN ESCALA NO SE INVENTA UN CRITERIO. Si la réplica no trajo el mes, la proyección vuelve al jornal
  // pactado — y eso se DICE. Cambiar de base en silencio sería publicar otro número con el mismo
  // rótulo, que es exactamente lo que este archivo existe para impedir.
  if (!sigma) {
    return sub('la réplica _UOCRA_RAW no trae la escala de este mes: la proyección de abajo vuelve al '
      + 'jornal PACTADO, no al convenio. El supuesto del 100% se reactiva solo cuando la réplica se actualice.')
  }
  const cuantos = celdaPersonas ? `"&${celdaPersonas}&"` : 'las'
  // `IFERROR(...;0)` y no `N(...)` a secas: si una celda de «Básico convenio» devolviera algo que el
  // producto escalar no sabe multiplicar, la línea que avisa del problema sería ella misma un #VALUE! —
  // el aviso se perdería justo cuando hace falta. Un error acá se lee como "no hay escala", que es lo
  // que efectivamente pasa.
  return `=IF(IFERROR(N(${sigma});0)=0;`
    + `"   · ⚠ el convenio no devolvió escala para las categorías del plantel: la proyección de abajo `
    + `queda VACÍA a propósito. Un 0 acá diría que no hay jornales que pagar, y sería mentira.";`
    + `"   · SUPUESTO DEL DUEÑO — la proyección paga el 100% DEL CONVENIO: las ${cuantos} personas del `
    + `plantel valuadas a la hora de escala de SU categoría, no al jornal pactado. Hoy pagamos POR `
    + `DEBAJO (ver 1.1): esto proyecta lo que costaría cumplir la escala, no lo que se viene pagando.")`
}

/**
 * NÚCLEO PURO: la Σ $/hora del plantel al convenio, CALCULADA EN JAVASCRIPT desde las mismas fuentes.
 *
 * No la consume la pestaña —la pestaña usa la fórmula viva, que es la que se mueve sola—: esto existe
 * para que la corrida IMPRIMA el número y para que un test lo pueda fijar. Un producto escalar armado
 * con referencias de celdas se puede escribir mal de mil maneras y ninguna da error; tener el número
 * esperado por otro camino es la única forma de notarlo.
 *
 * Recorre PERSONA POR PERSONA, no categoría por categoría: así una fila con categoría desconocida se
 * cuenta como lo que es —una persona sin escala— en vez de desaparecer del total.
 *
 * @param {any[][]} grid el espejo completo
 * @param {{inicio:number, fin:number}} bloque
 * @param {{categorias:Object}|null} escalon el escalón vigente ya parseado
 * @returns {{total:number, personas:number, porCategoria:Array, sinEscala:string[]}}
 */
export function sigmaConvenioDelPlantel(grid = [], bloque = null, escalon = null, tabla = CONVENIO_POR_CODIGO) {
  const vacio = { total: 0, personas: 0, porCategoria: [], sinEscala: [] }
  if (!bloque) return vacio
  const acum = new Map()
  const sinEscala = []
  let personas = 0
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const fila = grid[r - 1] ?? []
    if (!String(fila[COL_NOMBRE] ?? '').trim()) continue
    personas++
    const codigo = String(fila[COL_CATEGORIA] ?? '').trim()
    const convenio = convenioDe(codigo, tabla)
    const basico = convenio ? escalon?.categorias?.[convenio]?.basico : null
    if (typeof basico !== 'number') {
      if (codigo && !sinEscala.includes(codigo)) sinEscala.push(codigo || '(sin categoría)')
      continue
    }
    const k = `${codigo}|${convenio}`
    const prev = acum.get(k) ?? { codigo, convenio, personas: 0, basico, subtotal: 0 }
    acum.set(k, { ...prev, personas: prev.personas + 1, subtotal: prev.subtotal + basico })
  }
  const porCategoria = [...acum.values()]
  return {
    total: porCategoria.reduce((s, x) => s + x.subtotal, 0),
    personas,
    porCategoria,
    sinEscala,
  }
}
