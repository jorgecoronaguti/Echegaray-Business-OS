// LA PLANILLA COMO ES, ARMADA POR COORDENADA DE HOJA — fixture compartido de los tests de costo por
// obra y del control del resumen.
//
// POR QUE ESTE FIXTURE Y NO UNO COMODO. Los dos defectos mas caros de este modulo se les escaparon a
// catorce tests verdes porque el fixture era mas prolijo que el archivo:
//
//   · todos los bloques tenian las mismas columnas (V horas, W valor hora), asi que clavar
//     `colValorHora = colHoras + 1` no ponia rojo a nadie: la regla "ninguna coordenada se asume"
//     no estaba probada. Por eso ACA EL ANCHO Y LAS COLUMNAS DE PLATA SON PARAMETROS.
//   · el rango leido siempre arrancaba en A1, asi que restar el offset o no restarlo daba igual;
//     con `offset.fila = 400` el control del resumen se quedaba ciego y contestaba "limpio". Por eso
//     ACA TODO SE DECLARA EN COORDENADAS DE HOJA y el fixture las traduce a indices de grilla.
//
// La forma de la fila del bloque esta calcada de la fila 496 del archivo real: los rotulos de
// identidad ("n", "Obrero", "Categoria") y las fechas conviven en la MISMA linea, y CLIENTE/OBRA
// cierran a la derecha.

import { indiceColumna } from './jornales-estructura.mjs'

export const txt = (v) => ({ formula: null, valor: v, numero: null, formato: null, derivada: false })
export const num = (n) => ({ formula: null, valor: String(n), numero: n, formato: null, derivada: false })
export const frm = (f, n = null) => ({ formula: f, valor: n == null ? null : String(n), numero: n, formato: null, derivada: false })
export const vacia = () => ({ formula: null, valor: null, numero: null, formato: null, derivada: false })

/** Las columnas del archivo real ("Obreros 26"). Cualquier test puede pedir otras. */
export const COLS_REALES = Object.freeze({
  nombre: 'B', categoria: 'D', dia: 'F', horas: 'V', vh: 'W', total: 'AA', cliente: 'AB', obra: 'AC',
})

/**
 * Constructor de planilla. `offsetFila`/`offsetCol` son los del rango leido (readSheetGrid los
 * devuelve): todo lo que se declara son coordenadas de HOJA y el fixture las convierte.
 */
export function planilla({ offsetFila = 0, offsetCol = 0 } = {}) {
  const filas = []
  const gcol = (letra) => indiceColumna(letra) - offsetCol
  const filaHoja = () => filas.length + 1 + offsetFila
  const nueva = () => []
  const poner = (fila, letra, celda) => {
    const j = gcol(letra)
    if (j < 0) return // columna fuera del rango leido: en la hoja existe, acá no se ve
    while (fila.length <= j) fila.push(vacia())
    fila[j] = celda
  }

  const api = {
    filas,
    /** Fila cruda, para los casos que el fixture no modela (una fila de totales, un rotulo suelto). */
    cruda(celdas = {}) {
      const f = nueva()
      for (const [letra, c] of Object.entries(celdas)) poner(f, letra, c)
      filas.push(f)
      return filaHoja() - 1
    },
    /** Fila de bloque: rotulos de identidad + fechas + CLIENTE/OBRA, todo en la misma linea. */
    bloque(fechas, cols = COLS_REALES) {
      const f = nueva()
      poner(f, 'A', txt('n'))
      poner(f, cols.nombre, txt('Obrero'))
      poner(f, cols.categoria, txt('Categoria'))
      fechas.forEach((d, i) => poner(f, colMas(cols.dia, i), txt(d)))
      poner(f, cols.cliente, txt('CLIENTE'))
      if (cols.obra) poner(f, cols.obra, txt('OBRA'))
      filas.push(f)
      return filaHoja() - 1
    },
    /** Fila de persona, escrita como la escribe la planilla: horas por =SUM y total por producto. */
    persona({ nombre, categoria = 'OF', horas = [], vh = 5000, cliente = '', obra = null, cols = COLS_REALES, ancho = null }) {
      const f = nueva()
      const fila = filas.length + 1 + offsetFila
      poner(f, cols.nombre, txt(nombre))
      poner(f, cols.categoria, txt(categoria))
      horas.forEach((h, i) => {
        if (h === null) return
        poner(f, colMas(cols.dia, i), typeof h === 'string' ? txt(h) : num(h))
      })
      const ultima = colMas(cols.dia, (ancho ?? horas.length) - 1)
      const suma = horas.reduce((a, h) => a + (typeof h === 'number' ? h : 0), 0)
      poner(f, cols.horas, frm(`=SUM(${cols.dia}${fila}:${ultima}${fila})`, suma))
      if (vh != null) poner(f, cols.vh, num(vh))
      poner(f, cols.total, frm(`=${cols.horas}${fila}*${cols.vh}${fila}`, vh == null ? null : suma * vh))
      poner(f, cols.cliente, txt(cliente))
      if (obra != null && cols.obra) poner(f, cols.obra, txt(obra))
      filas.push(f)
      return fila
    },
    /**
     * Fila de resumen con la forma REAL: el rotulo en una columna, UNA COLUMNA VACIA en el medio, y
     * el SUMIFS en la siguiente, apuntando por formula a la celda del rotulo. Armarla con el rotulo
     * pegado a la formula es lo que dejaba pasar la version que miraba "la celda de al lado".
     */
    resumen({ rotulo, colRotulo = 'V', colFormula = 'X', cols = COLS_REALES, desde = 1, hasta = 20, envuelto = false, total = null }) {
      const f = nueva()
      const fila = filas.length + 1 + offsetFila
      poner(f, colRotulo, txt(rotulo))
      const sumifs = `SUMIFS(${cols.total}${desde}:${cols.total}${hasta};${cols.cliente}${desde}:${cols.cliente}${hasta};${colRotulo}${fila})`
      poner(f, colFormula, frm(envuelto ? `=IFERROR(${sumifs};0)` : `=${sumifs}`, total))
      filas.push(f)
      return fila
    },
    grid(titulo = 'Obreros 26') {
      return { titulo, filas, merges: [], offset: { fila: offsetFila, col: offsetCol } }
    },
  }
  return api
}

/** Letra de columna corrida `n` posiciones a la derecha. */
function colMas(letra, n) {
  let i = indiceColumna(letra) + n
  let s = ''
  while (i >= 0) { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1 }
  return s
}

/** El mapa que en produccion sale de public.cliente_alias. */
export const MAPA = {
  leido: true,
  alias: new Map([
    ['LA ESTRELLA', 'LA ESTRELLA'],
    ['MESSINA', 'MESSINA'],
    ['MESSINAS', 'MESSINA'],
    ['QUATTROPANI', 'QUATTROPANI'],
    ['ARCOR', 'ARCOR'],
  ]),
  noCliente: new Map([['Z. ENFERMEDAD', 'Horas pagadas por enfermedad.']]),
}
