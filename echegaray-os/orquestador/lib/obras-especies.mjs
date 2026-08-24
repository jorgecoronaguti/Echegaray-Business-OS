// LA ESPECIE DE CADA CELDA DE `OBRAS` — el formato sale de lo que la celda ES, no de una lista.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (14/08/2026) ═══
//
// La columna `Vencido` publicó `17449303,3143` crudo, alineado a la izquierda y derramando sobre la
// columna de al lado, mientras sus vecinas de la MISMA columna mostraban "—". Medido sobre el archivo:
// esas seis celdas tenían `userEnteredFormat = {numberFormat: TEXT, horizontalAlignment: LEFT,
// wrapStrategy: OVERFLOW_CELL}` y las demás, el patrón de moneda. Las que valían cero se veían bien
// por accidente: el tercer tramo del patrón dibuja el cero como raya, así que una columna entera puede
// estar mal formateada y no notarse hasta el primer importe distinto de cero.
//
// LA CAUSA NO ERA UNA LÍNEA OLVIDADA, ERAN DOS MECANISMOS QUE DECIDEN EL MISMO FORMATO:
//
//   1. UNA LISTA DE RANGOS ESCRITA A MANO en el escritor (`PLATA`, `F_VENCIDO`, `textoEnF`,
//      `importeEnH`, `totales`, `protagonistas`). La celda que ninguna lista nombra se queda con el
//      formato que le dejó la corrida anterior — `estilo-pestana.reset()` repone fondo, fuente,
//      alineación y ajuste, y a propósito NO repone `numberFormat`. La columna A es la prueba viva:
//      ninguna lista la nombra, así que nadie le repuso jamás un formato de número.
//   2. UN OLFATEADOR DE CONTENIDO (`requestsTextoPorContenido`) que corría ÚLTIMO y ganaba. Decide
//      "esto es texto" mirando el string de la celda, y su propia documentación declara el límite:
//      *"una celda cuyo valor lo produce una FÓRMULA no se puede clasificar sin evaluarla"*. Un
//      importe releído del archivo ya formateado ("▲ 17.449.303") o un guion literal escrito por el
//      generador ("—", que es lo que publica una obra sin contrato) NO parecen números, así que los
//      marca TEXTO — y un número con formato de texto se dibuja crudo. En el archivo del 14/08 eso se
//      ve en `G27`/`H27`: las dos celdas de contrato de MESSINA — BSA, en TEXTO, en medio de una
//      columna de moneda.
//
// LA REGLA: quien ESCRIBE el valor declara su ESPECIE, en la misma línea. Es la misma decisión que ya
// se tomó en `proveedores-encabezado.mjs` por el mismo defecto (`Proveedores!B12` publicando
// `11919062,68`). El formato deja de ser una lista que alguien tiene que acordarse de actualizar y
// pasa a ser una PROYECCIÓN del dato: si mañana entra una columna nueva, o no declara especie —y el
// test la nombra— o la declara y sale bien dibujada la primera vez.
//
// LA COBERTURA ES TOTAL, Y ESO ES LA MITAD DE LA CURA. Cada corrida repone el `numberFormat` de las
// NUEVE columnas en TODAS las filas del bloque, incluidas la A y las vacías. Un formato que nadie
// repone es estado que sobrevive para siempre: así es como seis celdas quedaron en TEXTO.

import {
  MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_ALERTA, MONEDA_ALERTA_TOTAL, PORCENTAJE,
} from './formato-statement.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const TEXTO = { type: 'TEXT' }
const FECHA = { type: 'DATE', pattern: 'dd/mm/yyyy' }

/**
 * EL VOCABULARIO. Cada especie dice las tres cosas que deciden cómo se dibuja una celda, y las tres
 * salen de la MISMA declaración: no se puede declarar plata y que quede alineada como prosa.
 *
 *   · `rotulo`  el nombre de una fila o de una columna. No derrama: si no entra, la columna se
 *               ensancha (`anchoColumnaA`), no se come la celda de al lado.
 *   · `texto`   prosa de auditoría dentro de la tabla — el `Compras: "BSA"` que declara por dónde
 *               emparejó cada obra. SÍ derrama: con CLIP no se recorta, DESAPARECE, y justo en las
 *               filas donde sí hay algo que auditar.
 *   · `moneda` / `monedaTotal`   cuerpo y cierre. El "$" es del cierre (ver formato-statement).
 *   · `alerta` / `alertaTotal`   la columna que tiene que hacer levantar el teléfono.
 *   · `porcentaje`, `fecha`.
 */
export const ESPECIES = Object.freeze({
  rotulo: { numberFormat: TEXTO, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' },
  texto: { numberFormat: TEXTO, horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL' },
  moneda: { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  monedaTotal: { numberFormat: MONEDA_TOTAL, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  alerta: { numberFormat: MONEDA_ALERTA, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  alertaTotal: { numberFormat: MONEDA_ALERTA_TOTAL, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  porcentaje: { numberFormat: PORCENTAJE, horizontalAlignment: 'RIGHT', wrapStrategy: 'CLIP' },
  fecha: { numberFormat: FECHA, horizontalAlignment: 'CENTER', wrapStrategy: 'CLIP' },
})

/** Las especies que llevan plata. El auditor las usa para exigir formato de número donde hay importe. */
export const ESPECIES_DE_PLATA = Object.freeze(['moneda', 'monedaTotal', 'alerta', 'alertaTotal'])

/**
 * LA ESPECIE POR DEFECTO DE CADA COLUMNA (A..I) — para la celda VACÍA, no para la que tiene dato.
 *
 * Una celda vacía necesita formato igual: es la única forma de que la corrida siguiente no herede el
 * TEXTO que le dejó la anterior. Y el defecto correcto para una celda vacía es el de SU columna: es lo
 * que va a necesitar el día que tenga valor. La celda con dato NO usa esto — lo declara quien la
 * escribe, y el auditor exige que lo haga.
 */
export const ESPECIE_DE_COLUMNA = Object.freeze([
  'rotulo', 'porcentaje', 'moneda', 'moneda', 'moneda', 'alerta', 'moneda', 'fecha', 'moneda',
])

/** ¿La celda no lleva nada? El centinela `VACIO` del generador cuenta como vacía. */
const vacia = (v) => v === undefined || v === null || v === '' || v === VACIO

/**
 * LA MATRIZ COMPLETA DE ESPECIES: una por celda, sin agujeros.
 *
 * SE PIDE EL ALTO Y NO LA GRILLA a propósito: el escritor formatea también la COLA —las filas que
 * este generador dejó de emitir y limpia— y esas filas necesitan formato igual. Una fila sin formato
 * es donde el TEXTO de una corrida vieja sobrevive esperando el próximo importe.
 *
 * @param {number} alto cuántas filas se van a formatear
 * @param {(string|null)[][]} declaradas lo que declaró quien escribió cada valor
 * @param {number} ancho columnas de la pestaña
 * @returns {string[][]} `alto` × `ancho`, cada celda con una especie del vocabulario
 */
export function matrizDeEspecies(alto = 0, declaradas = [], ancho = ESPECIE_DE_COLUMNA.length) {
  return Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => (
    declaradas?.[i]?.[j] ?? ESPECIE_DE_COLUMNA[j] ?? 'rotulo')))
}

/**
 * ¿QUÉ CELDA ESCRIBE UN VALOR SIN DECLARAR SU ESPECIE? — el control que impide que el defecto vuelva.
 *
 * No pretende tipar fórmulas: pretende que nadie agregue una columna de plata y se entere mirando
 * `17449303,3143` en la pestaña. Una celda con dato —número tipeado o fórmula— tiene que decir qué
 * devuelve, porque de eso sale su `numberFormat`; si no lo dice, cae en el defecto de su columna, que
 * es una adivinanza.
 *
 * @returns {{fila:number, col:number, valor:string}[]} filas y columnas 1-based / 0-based como el resto
 */
export function celdasSinEspecie(filas = [], declaradas = []) {
  const out = []
  filas.forEach((fila, i) => (fila || []).forEach((v, j) => {
    if (vacia(v)) return
    if (declaradas?.[i]?.[j]) return
    out.push({ fila: i + 1, col: j, valor: String(v).slice(0, 60) })
  }))
  return out
}

/**
 * ¿QUÉ CELDA DE PLATA QUEDARÍA DIBUJADA COMO TEXTO? — el control que mira el defecto de frente.
 *
 * Recorre la matriz ya resuelta y devuelve toda celda cuyo contenido es un número (tipeado o una
 * fórmula que suma) y cuya especie no dibuja números. Es el test que se pone en rojo si mañana alguien
 * declara `texto` sobre una columna de importes — que es exactamente lo que pasó con `Vencido`.
 */
export function celdasDePlataSinFormatoDeNumero(filas = [], especies = []) {
  const SUMA = /^=\s*\(?\s*(SUM|SUMIF|SUMIFS|SUMPRODUCT|ROUND|IFERROR\s*\(\s*SUM)/i
  const out = []
  filas.forEach((fila, i) => (fila || []).forEach((v, j) => {
    const esNumero = typeof v === 'number' || (typeof v === 'string' && SUMA.test(v))
    if (!esNumero) return
    const e = especies?.[i]?.[j]
    // `fecha` también es un número que NO es plata: el cuadro 5 escribe la fecha estimada como
    // serial con su especie declarada (24/08 crudo se auto-parseaba y mostraba 46258). Esta regla
    // es anterior a que existiera una columna de fechas; sin la excepción, declarar bien la fecha
    // contaba como defecto.
    if (ESPECIES_DE_PLATA.includes(e) || e === 'porcentaje' || e === 'fecha') return
    out.push({ fila: i + 1, col: j, especie: e ?? null, valor: String(v).slice(0, 60) })
  }))
  return out
}

/**
 * LOS REQUESTS DE FORMATO, agrupados en tramos contiguos por columna.
 *
 * Una pestaña de 45 filas × 9 columnas son 405 celdas: un pedido por celda haría que el batch de
 * formato pese más que toda la corrida. Se agrupa por especie repetida, que además es como se lee.
 *
 * @param {number} sheetId
 * @param {string[][]} especies la matriz de `matrizDeEspecies`
 * @returns {object[]} requests de `repeatCell`
 */
export function requestsDeEspecie(sheetId, especies = []) {
  const ancho = especies[0]?.length ?? 0
  const req = []
  for (let c = 0; c < ancho; c++) {
    let desde = 0
    for (let f = 0; f <= especies.length; f++) {
      const act = especies[f]?.[c]
      if (f < especies.length && act === especies[desde]?.[c]) continue
      const e = ESPECIES[especies[desde]?.[c]]
      if (e) {
        req.push({
          repeatCell: {
            range: { sheetId, startRowIndex: desde, endRowIndex: f, startColumnIndex: c, endColumnIndex: c + 1 },
            cell: { userEnteredFormat: e },
            fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy',
          },
        })
      }
      desde = f
    }
  }
  return req
}
