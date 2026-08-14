// LA COPIA HUÉRFANA: CÓMO SE PRUEBA QUE UNA CELDA ES RESIDUO DE UN REDISEÑO, Y NO UNA EDICIÓN.
//
// ═══ QUÉ QUEDÓ, Y POR QUÉ NO SE VA SOLO (14/08) ═══
//
// "Jornales por Quincena" se rediseñó el 13/08. Las filas se movieron y en las coordenadas nuevas
// quedó lo que el layout ANTERIOR tenía ahí. La mayor parte de eso lo cura ahora el propio generador
// —ver el veredicto de residuo de rediseño en `huella-celda.mjs`—, pero hay dos clases que NO puede
// curar, y las dos por la misma razón: son celdas donde el generador NO ESCRIBE.
//
//   · la columna «Convenio (tuya)» del bloque 4.1 (E), declarada del dueño el 07/08;
//   · la columna «Pagado el» del registro (N), declarada 100% del dueño el 31/07.
//
// En esas dos columnas el generador emite cadena vacía —"no es mía, preservá lo que haya"— y esa es
// exactamente la protección que evitó seis pérdidas de trabajo del dueño. No se afloja. Lo que queda
// es una limpieza DECLARADA: una persona nombra las celdas, y para cada una hay que poder PROBAR que
// es del OS antes de tocarla.
//
// ═══ LA PRUEBA: UNA COPIA HUÉRFANA DE ALGO QUE ESTÁ VIVO ═══
//
// La evidencia no es "parece del OS" ni "está donde no va". Es más fuerte y es verificable por un
// tercero: **la misma cosa está viva, hoy, adentro de la tabla que el generador sí posee, en la misma
// columna.** Una celda así no es un dato: es un duplicado que quedó atrás cuando la tabla se mudó.
//
// Medido en el archivo vivo el 14/08:
//
//   E76 `=IFERROR(MIN(FILTER(Compras!…)))`  ← la misma forma vive en E56, adentro del bloque 3
//   E79 `=IFERROR(MAX(FILTER(Compras!…)))`  ← la misma forma vive en E59:E70, ídem
//   N110 "Pagado el"                        ← el encabezado vivo del registro está en N115
//   N113 46038                              ← el MISMO valor está vivo en N116
//   N114 46055                              ← el MISMO valor está vivo en N117
//
// Los dos últimos son la parte que había que mirar antes de escribir: son fechas que carga el dueño.
// Si NO estuvieran duplicadas adentro del registro, borrarlas destruiría el único ejemplar — y esta
// regla las conservaría, que es el punto. Están duplicadas porque el generador ya las re-copió a su
// posición nueva anclando en la cabecera del registro (ver `copiarPagadoEl`): lo que sobra es la
// copia vieja, no el dato.
//
// EL LADO PARA EQUIVOCARSE ES CONSERVAR. Sin gemelo vivo, la celda se queda y se dice por qué.

import { formaDe, formaComparable } from './huella-forma.mjs'

/** ¿La celda es un número puro? Una fórmula no lo es aunque rinda uno: acá se lee el contenido. */
const esNumero = (v) => {
  const t = String(v ?? '').trim()
  return t !== '' && !t.startsWith('=') && Number.isFinite(Number(t.replace(/\./g, '').replace(',', '.')))
}
const aNumero = (v) => Number(String(v).trim().replace(/\./g, '').replace(',', '.'))

/**
 * ¿Dos celdas son "la misma cosa"?
 *
 * Para una fórmula o un texto, el mismo criterio con el que la huella reclama propiedad: la FORMA.
 * Dos fórmulas que sólo difieren en el número de fila son la misma fórmula corrida de lugar, y eso es
 * justamente lo que un rediseño produce.
 *
 * PARA UN NÚMERO, NO. `formaDe` enmascara todo número como `<n>`, así que por forma **46038 y 46099
 * serían "la misma cosa"** — y con eso una fecha que el dueño cargó y el registro NO tiene se
 * borraría porque "hay otro número parecido más abajo". Un serial se compara por su VALOR o no se
 * compara. Es la diferencia entre probar que una celda es una copia y suponerlo.
 */
const igual = (a, b) => {
  if (esNumero(a) || esNumero(b)) return esNumero(a) && esNumero(b) && aNumero(a) === aNumero(b)
  const fa = formaComparable(formaDe(a))
  return Boolean(fa) && fa === formaComparable(formaDe(b))
}

/**
 * NÚCLEO PURO: ¿esta celda es una copia huérfana de algo vivo adentro de la tabla?
 *
 * @param {any[][]} grid   la pestaña leída con render FORMULA, la fila 1 en el índice 0
 * @param {{fila:number, col:number, tabla:[number,number]}} c
 *        la celda candidata (1-based, col 0-based) y el rango de filas de la tabla VIVA de su columna
 * @returns {{fila:number, col:number, valor:string, gemelo:number|null, motivo:string}}
 */
export function copiaHuerfana(grid = [], { fila, col, tabla }) {
  const valor = (grid[fila - 1] || [])[col]
  const base = { fila, col, valor: String(valor ?? '').slice(0, 80), gemelo: null }
  if (!formaDe(valor)) return { ...base, motivo: 'la celda está vacía: no hay nada que limpiar' }
  const [f0, f1] = tabla
  if (fila >= f0 && fila <= f1) return { ...base, motivo: 'la celda está ADENTRO de la tabla viva: no es huérfana' }
  for (let f = f0; f <= f1; f++) {
    if (igual(valor, (grid[f - 1] || [])[col])) {
      return { ...base, gemelo: f, motivo: `la misma cosa está viva en la fila ${f}, adentro de la tabla` }
    }
  }
  return { ...base, motivo: 'NO tiene gemelo vivo adentro de la tabla: puede ser tuyo, se conserva' }
}

/**
 * NÚCLEO PURO: el veredicto de una lista DECLARADA de candidatas. Devuelve las dos listas, siempre —
 * un limpiador que sólo informa lo que va a borrar esconde justo lo que hay que revisar.
 *
 * @returns {{vaciables:Array, conservadas:Array}}
 */
export function residuosDeclarados(grid = [], candidatas = []) {
  const todas = candidatas.map((c) => copiaHuerfana(grid, c))
  return {
    vaciables: todas.filter((x) => x.gemelo !== null),
    conservadas: todas.filter((x) => x.gemelo === null),
  }
}
