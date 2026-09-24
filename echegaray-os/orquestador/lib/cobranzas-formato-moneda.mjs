// UNA FILA EN DÓLARES SE VE EN DÓLARES — EL FORMATO DE LOS IMPORTES SIGUE A LA COLUMNA «Moneda».
//
// EL DEFECTO (24/09/2026). El dueño: «estás mezclando dólares con pesos». Las filas 62 y 79–81 de
// Cobranzas dicen `Moneda = USD` y sus importes son dólares (U$S 15.400 y 3 × U$S 3.500), pero la
// columna entera tiene formato de pesos y se dibujaban «$ 3.500,00». Las fórmulas ya valuaban esas
// filas; la pantalla no: quien mira la fila lee pesos.
//
// POR QUÉ `updateCells` Y NO `repeatCell` —y por qué el primer intento «respondió que sí» y no hizo
// nada—. Cobranzas tiene un FILTRO BÁSICO (A4:AH) que oculta, entre otros, a Quattropani. Un
// `repeatCell` sobre filas ocultas por el filtro se acepta con `replies:[{}]` y NO les cambia el
// formato: Sheets lo aplica sólo a las filas visibles, igual que cuando se formatea a mano con un
// filtro puesto. Medido en vivo sobre K79:N79: `repeatCell` → el patrón siguió en pesos; `updateCells`
// con el mismo patrón → «U$S 3.500,00». Es la causa que dos comentarios de este repo describen sin
// nombrarla («seis celdas quedaban sin formato, no contiguas», cobranzas-control; «el repeatCell se
// acepta con 200 y no cambia nada», cobranzas-por-cliente).
//
// QUÉ CAMBIA Y QUÉ NO. Sólo el SÍMBOLO del patrón que la celda ya tiene: `"$ "` ↔ `"U$S "` (y `"($ "`
// ↔ `"(U$S "` en los negativos). Los
// decimales, el rojo de los negativos y el guion del cero son los que eligió el dueño, y se conservan.
// Una fila que deja de decir USD vuelve a pesos por la misma regla: el formato es función de la
// columna Moneda, no una marca que alguien tiene que acordarse de sacar.
//
// EL CRITERIO ES EL DE LAS FÓRMULAS: `Moneda = "USD"` (Sheets compara sin distinguir mayúsculas). Si
// el formato reconociera «U$S» o «DOLAR» y las fórmulas no, la celda diría dólares mientras la suma la
// cuenta como pesos: la contradicción que esto vino a cerrar, del otro lado.

import { MONEDA_USD } from './cobranzas-contrato.mjs'

/** Los importes de una fila de Cobranzas, por clave de `COBRANZAS_OS`: K · L · M · N · X. */
export const COLUMNAS_IMPORTE = Object.freeze(['neto', 'iva', 'retenciones', 'total', 'montoPonderado'])

/** El símbolo al principio de un literal del patrón: `"$ "` en los positivos, `"($ "` en los negativos. */
const EN_PESOS = /"(\(?)\$ /g
const EN_USD = /"(\(?)U\$S /g
/** Para una celda en dólares sin patrón propio: el mismo dibujo que el de pesos de la pestaña. */
export const PATRON_USD = '"U$S "#,##0.00;[RED]"(U$S "#,##0.00\\);\\-'

/** ¿Esta celda de la columna Moneda dice dólares, con el criterio de las fórmulas? */
export const esUSD = (v) => String(v ?? '').toUpperCase() === MONEDA_USD

/**
 * NÚCLEO PURO: el formato numérico que tiene que tener una celda de importe, o `null` si ya está bien.
 * @param {{type?:string, pattern?:string}|null} actual el `userEnteredFormat.numberFormat` leído
 * @param {boolean} enDolares
 */
export function formatoPara(actual, enDolares) {
  const p = String(actual?.pattern ?? '')
  const tiene = (re) => new RegExp(re.source).test(p)
  if (enDolares) {
    if (tiene(EN_PESOS)) return { type: 'NUMBER', pattern: p.replace(EN_PESOS, '"$1U$$S ') }
    if (tiene(EN_USD)) return null
    return { type: 'NUMBER', pattern: PATRON_USD }
  }
  if (tiene(EN_USD)) return { type: 'CURRENCY', pattern: p.replace(EN_USD, '"$1$$ ') }
  return null
}

/**
 * NÚCLEO PURO: los `updateCells` que dejan cada importe en la moneda de su fila.
 *
 * @param {{monedas:any[][], formatos:Array<Array<{formato:any}>>, sheetId:number, desde:number,
 *          colInicio:number, columnas:number[]}} p
 *   `monedas` la columna Moneda desde la fila `desde`; `formatos` el `readSheetUserFormats` del bloque
 *   que empieza en `colInicio` (índice 0-based) y en la misma fila; `columnas` los índices 0-based de
 *   los importes (`COLUMNAS_IMPORTE` resueltas).
 * @returns {{pedidos:object[], celdas:Array<{fila:number, col:number, pattern:string}>}}
 */
export function pedidosDeFormato({ monedas = [], formatos = [], sheetId, desde, colInicio, columnas = [] }) {
  const pedidos = []
  const celdas = []
  const filas = Math.max(monedas.length, formatos.length)
  for (let i = 0; i < filas; i++) {
    const usd = esUSD(monedas[i]?.[0])
    for (const col of columnas) {
      const nf = formatoPara(formatos[i]?.[col - colInicio]?.formato?.numberFormat ?? null, usd)
      if (!nf) continue
      const fila = desde + i
      celdas.push({ fila, col, pattern: nf.pattern })
      // UNA CELDA POR PEDIDO, con `updateCells`: ver el encabezado — `repeatCell` saltea las filas que
      // el filtro oculta, y las filas en dólares de hoy son justamente las de un cliente filtrado.
      pedidos.push({
        updateCells: {
          range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: col, endColumnIndex: col + 1 },
          rows: [{ values: [{ userEnteredFormat: { numberFormat: nf } }] }],
          fields: 'userEnteredFormat.numberFormat',
        },
      })
    }
  }
  return { pedidos, celdas }
}
