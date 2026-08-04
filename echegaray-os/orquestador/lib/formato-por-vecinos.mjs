// UNA CELDA ESTÁ MAL FORMATEADA CUANDO SE VE CRUDA — Y ESO SE MIDE MIRANDO LO QUE SE VE.
//
// ═══ EL PEDIDO (04/08), TEXTUAL ═══
//
// "revisa todo el formato de todos los cuadro de toda la pestaña proveedores y arreglalos, son un
// desastre"
//
// ═══ EL DEFECTO REAL, MEDIDO EN Proveedores ═══
//
// El desorden no era estético: había importes que se mostraban SIN formato en medio de columnas
// formateadas — "100000" al lado de "$19.709.565", "-9272820,72" entre notas de crédito en rojo,
// "209231271" en toda la sección 6. En este archivo ya está documentado que un número que se comporta
// como texto no da error: el total simplemente lo ignora. Una columna con el formato saltado es el
// lugar donde un total deja de cerrar sin que nadie sepa por qué.
//
// ═══ POR QUÉ SE MIRA EL VALOR FORMATEADO Y NO `userEnteredFormat` ═══
//
// El primer detector preguntaba por `userEnteredFormat.numberFormat` y estuvo A UN PASO DE CONVERTIR
// FECHAS EN PESOS. La API **sólo devuelve `userEnteredFormat` cuando la celda lo tiene propio**: una
// celda que hereda el formato de su columna vuelve vacía. El detector leía ese vacío como "no tiene
// formato", y las columnas de fecha de las secciones 1 y 3 —que se ven perfectas— aparecían como 25
// defectos a reparar con patrón de moneda. Un serial de fecha (46.000 y pico) es un número mayor a
// mil: la heurística de magnitud lo habría convertido en "$46.234" en veinticinco celdas.
//
// El criterio correcto es el del ojo: **una celda numérica está mal si su valor FORMATEADO es la
// representación cruda del número**. Sin separador de miles, sin símbolo, sin forma de fecha. Eso no
// depende de dónde viva el formato ni de si se hereda: depende de lo que la persona ve.
//
// ═══ Y EL PATRÓN CON QUE SE REPARA TAMPOCO SE CABLEA ═══
//
// Sale de cómo se ven las OTRAS celdas de la misma columna dentro del mismo cuadro: si las vecinas
// muestran barras es una columna de fechas, si muestran `$` es de plata, si no, es un conteo.
// Cablear "la columna D es moneda" sería el mismo error que se acaba de sacar de la sección 1 —la
// identidad escrita en el código en vez de salir del dato— y se rompe en cuanto se mueve un cuadro.

/** Moneda es-AR sin decimales, negativo en rojo: es como ya se ven los importes de esta pestaña. */
export const MONEDA = '"$"#,##0;[Red]-"$"#,##0'
/** Un CONTEO no lleva `$`: "521 comprobantes" con signo peso es un dato falso a la vista. */
export const CONTEO = '#,##0'
/** La fecha del archivo, es-AR. Nunca se repara una fecha con patrón de importe. */
export const FECHA = 'dd/mm/yyyy'

/** Por debajo de mil no hace falta separador de miles: "521" está bien escrito y no es defecto. */
export const MINIMO_CON_SEPARADOR = 1000

/**
 * ¿La celda se ve CRUDA? Es decir: ¿lo que muestra es el número pelado?
 *
 * Se ve cruda si no tiene separador de miles (`.` en es-AR), ni símbolo de moneda, ni barras de
 * fecha, ni el `%` de un porcentaje. Los números chicos quedan afuera a propósito: un conteo de 2
 * comprobantes se escribe "2" y eso es correcto.
 *
 * @param {unknown} valor el valor sin formato (UNFORMATTED_VALUE)
 * @param {unknown} visto el valor como se muestra (FORMATTED_VALUE)
 */
export function seVeCrudo(valor, visto) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return false
  const v = String(visto ?? '').trim()
  if (v === '') return false
  if (/[$%/]/.test(v)) return false
  if (v.includes('.')) return false
  // Un decimal a la vista sin separador de miles ("‑9272820,72") es la firma del importe sin formato.
  if (/,\d{2,}$/.test(v)) return true
  return Math.abs(valor) >= MINIMO_CON_SEPARADOR
}

/**
 * QUÉ CLASE DE COLUMNA ES, según cómo se ven sus celdas ya formateadas.
 *
 * SÓLO VOTAN LAS CELDAS QUE ESTÁN BIEN. Una columna de fechas donde tres se ven crudas sigue siendo
 * una columna de fechas, y esas tres se reparan como fechas y no como plata. Al revés también
 * importa: si vota una celda cruda, una columna donde TODAS están crudas se declara "conteo" —
 * porque ninguna muestra `$`— y los $209.231.271 de la sección 6 se repararían sin el signo pesos.
 *
 * @param {Array<{valor:unknown, visto:unknown}>} celdas el tramo de una columna dentro de un cuadro
 * @returns {'fecha'|'moneda'|'conteo'|null} null = nadie con quien compararse
 */
export function claseDeColumna(celdas = []) {
  let fechas = 0
  let plata = 0
  let otros = 0
  for (const c of celdas ?? []) {
    if (typeof c?.valor !== 'number') continue
    if (seVeCrudo(c?.valor, c?.visto)) continue
    const v = String(c?.visto ?? '').trim()
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) fechas++
    else if (v.includes('$')) plata++
    else if (v !== '') otros++
  }
  if (!fechas && !plata && !otros) return null
  if (fechas >= plata && fechas >= otros && fechas > 0) return 'fecha'
  if (plata >= otros && plata > 0) return 'moneda'
  return 'conteo'
}

const PATRON = { fecha: FECHA, moneda: MONEDA, conteo: CONTEO }

/**
 * Cuando ninguna celda de la columna está bien formateada no hay a quién imitar (le pasa a la
 * sección 6 entera). Ahí decide la magnitud, que en esta empresa separa bien: ningún importe vive
 * por debajo de mil y ningún conteo de comprobantes llega a mil.
 *
 * Nunca devuelve `fecha`: adivinar una fecha sin una sola vecina que la respalde es exactamente el
 * error que este archivo evita.
 */
export function clasePorMagnitud(celdas = []) {
  const nums = (celdas ?? []).map((c) => c?.valor).filter((v) => typeof v === 'number' && v !== 0)
  if (!nums.length) return null
  return Math.max(...nums.map((v) => Math.abs(v))) >= MINIMO_CON_SEPARADOR ? 'moneda' : 'conteo'
}

/**
 * LAS CELDAS DE UN TRAMO DE COLUMNA QUE HAY QUE REPARAR, Y CON QUÉ PATRÓN.
 *
 * @param {Array<{fila:number, valor:unknown, visto:unknown}>} celdas
 * @returns {Array<{fila:number, patron:string, clase:string, visto:string}>}
 */
export function reparacionesDeColumna(celdas = []) {
  const clase = claseDeColumna(celdas) ?? clasePorMagnitud(celdas)
  if (!clase) return []
  return (celdas ?? [])
    .filter((c) => seVeCrudo(c?.valor, c?.visto))
    .map((c) => ({ fila: c.fila, patron: PATRON[clase], clase, visto: String(c?.visto ?? '') }))
}

/**
 * RESIDUO EN UNA FILA DE TOTAL — el dato falso que ningún control mira.
 *
 * Medido en Proveedores: la fila 73, "TOTAL PROVEEDORES COMERCIALES", tenía `F73 = "Electricidad"`
 * bajo el rótulo "Qué se le compra". Un total no le compra electricidad a nadie: es el texto del
 * último proveedor de la lista que quedó pegado cuando la fila de total se movió. No rompe ninguna
 * suma —por eso ningún control lo ve— pero es exactamente el "son un desastre" del pedido: una fila
 * de cierre que afirma algo que no es cierto.
 *
 * La regla es estrecha a propósito: sólo se marca una celda de TEXTO, en una fila cuyo rótulo empieza
 * con TOTAL o SUBTOTAL, que NO sea la primera columna (ahí vive el rótulo) y que NO venga de una
 * fórmula (una fórmula en una fila de total es un total, no un residuo).
 *
 * @param {Array<{fila:number, rotulo:unknown, celdas:Array<{col:number, valor:unknown, formula:unknown}>}>} filas
 * @returns {Array<{fila:number, col:number, valor:string}>}
 */
export function residuosEnTotales(filas = []) {
  const out = []
  for (const f of filas ?? []) {
    if (!/^\s*(sub)?total\b/i.test(String(f?.rotulo ?? ''))) continue
    for (const c of f?.celdas ?? []) {
      if (c?.col === 0) continue
      if (String(c?.formula ?? '').startsWith('=')) continue
      const v = String(c?.valor ?? '').trim()
      if (v !== '' && typeof c?.valor !== 'number') out.push({ fila: f.fila, col: c.col, valor: v })
    }
  }
  return out
}
