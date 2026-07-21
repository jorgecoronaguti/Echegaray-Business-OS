// UN TEXTO DE DOSCIENTOS CARACTERES NO ENTRA EN UNA CELDA. SÍ ENTRA EN UNA NOTA.
//
// POR QUÉ EXISTE (21/07). El dueño, sobre CAJA: "es un desastre el formato". Medido: la columna
// "Origen del dato" tiene textos de hasta 207 caracteres en una celda de 300px y una fila de 20px.
// En esa celda entran unos 48. O sea que la procedencia de cada saldo —lo que hace que el número
// sea creíble— estaba escrita y no se podía leer.
//
// Las tres salidas posibles y por qué se eligió la tercera:
//
//   1. ENSANCHAR la columna. Un origen de 207 caracteres necesitaría 1.100px: la pestaña pasa a
//      medir tres pantallas de ancho y los importes quedan fuera de la vista.
//   2. WRAP con altura automática. La fila crece a cuatro líneas y una tabla de veinte cuentas pasa
//      a medir ochenta líneas. Es el defecto que ya hizo ilegible otra pestaña de este archivo.
//   3. UNA ETIQUETA CORTA EN LA CELDA Y EL TEXTO COMPLETO EN LA NOTA. La tabla se lee de un vistazo
//      —"Extracto Santander · 21/07"— y el detalle entero está a un click, sin ocupar pantalla.
//
// La nota de Google Sheets es el lugar natural de la evidencia: no compite con el dato, no se corta,
// y sobrevive a los cambios de ancho. Lo que NO se hace es tirar el texto largo: la trazabilidad es
// justamente lo que la regla de oro pide declarar.

/** Cuántos caracteres entran, con holgura, en una celda de ancho `px` con la tipografía del OS. */
export const entranEn = (px) => Math.max(12, Math.floor((px - 12) / 5.7))

/**
 * NÚCLEO PURO: parte un texto en la etiqueta que va en la celda y la nota que va detrás.
 *
 * El corte busca un separador natural —el "·" que ya usan todos los orígenes del archivo, o un
 * espacio— para no partir una palabra al medio. Si el texto entra entero, no hay nota: una nota que
 * repite lo que ya se ve es ruido.
 *
 * @param {string} texto
 * @param {number} max caracteres que entran en la celda
 * @returns {{corto: string, nota: string|null}}
 */
export function partirTexto(texto, max = 44) {
  const t = String(texto ?? '').trim()
  if (!t || t.length <= max) return { corto: t, nota: null }

  const ventana = t.slice(0, max)
  const puntoMedio = ventana.lastIndexOf(' · ')
  const espacio = ventana.lastIndexOf(' ')
  // Se prefiere cortar en el separador de campos; si el primero está demasiado al principio, el
  // corte por espacio conserva más información útil.
  const corte = puntoMedio > max * 0.4 ? puntoMedio : (espacio > 0 ? espacio : max)
  return { corto: `${t.slice(0, corte).trim()}…`, nota: t }
}

/**
 * NÚCLEO PURO: los pedidos de nota para una columna entera.
 *
 * @param {Array<Array<any>>} filas la grilla ya escrita
 * @param {number} col índice de columna (0 = A)
 * @param {number} sheetId
 * @param {number} max caracteres que entran en esa columna
 * @returns {{requests: Array<object>, celdas: Array<Array<any>>, conNota: number}}
 */
export function notasDeColumna(filas, col, sheetId, max = 44) {
  const requests = []
  const celdas = filas.map((f) => [...(f || [])])
  let conNota = 0
  celdas.forEach((f, i) => {
    const { corto, nota } = partirTexto(f[col], max)
    if (!nota) return
    f[col] = corto
    conNota++
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rows: [{ values: [{ note: nota }] }],
        fields: 'note',
      },
    })
  })
  return { requests, celdas, conNota }
}

/**
 * NÚCLEO PURO: cuántos píxeles de alto necesita un párrafo con ajuste de línea.
 * Para los textos de introducción, que son de 300 caracteres y hoy viven en una fila de 20px.
 */
export function altoDeParrafo(texto, anchoPx, { lineaPx = 15, minimo = 20, maximo = 90 } = {}) {
  const t = String(texto ?? '')
  if (!t.trim()) return minimo
  const lineas = Math.ceil(t.length / entranEn(anchoPx))
  return Math.min(maximo, Math.max(minimo, lineas * lineaPx + 6))
}

/**
 * NÚCLEO PURO: el ancho que necesita cada columna para que su texto se lea.
 *
 * POR QUÉ EXISTE. Un reparador que ensancha columnas sirve una vez: en la corrida siguiente el
 * script dueño de la pestaña vuelve a escribir sus anchos declarados a mano y todo se corta otra
 * vez. El ancho no es una preferencia estética, es una consecuencia del contenido — así que se
 * calcula donde se conoce el contenido.
 *
 * SÓLO CUENTAN LAS CELDAS QUE DE VERDAD SE CORTAN: si la de al lado está vacía, el texto derrama y
 * se lee perfecto. Sin esta regla, un título de bloque de 60 caracteres forzaría la primera columna
 * a 350px y desplazaría toda la tabla por un texto que ya se veía bien.
 *
 * @param {Array<Array<any>>} filas
 * @param {{min?:number, max?:number, tam?:number, base?:number[]}} opts
 * @returns {number[]}
 */
export function anchosSegunContenido(filas = [], { min = 64, max = 300, tam = 10, base = [] } = {}) {
  const nCols = filas.reduce((m, f) => Math.max(m, (f || []).length), base.length)
  const out = Array.from({ length: nCols }, (_, j) => base[j] ?? min)
  for (const fila of filas) {
    for (let j = 0; j < nCols; j++) {
      const v = String(fila?.[j] ?? '')
      if (!v || v.startsWith('=')) continue
      // ¿Hay algo a la derecha? Si no, derrama y no necesita ancho propio.
      let choca = false
      for (let k = j + 1; k < nCols; k++) if (String(fila?.[k] ?? '').trim()) { choca = true; break }
      if (!choca) continue
      out[j] = Math.min(max, Math.max(out[j], Math.ceil(v.length * tam * 0.57) + 18))
    }
  }
  return out
}
