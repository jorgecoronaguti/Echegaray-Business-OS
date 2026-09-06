// LOS NÚMEROS DE «Plantel» QUE NO TIENEN DERECHO A ESTAR PEGADOS.
//
// ═══ EL CENSO, MEDIDO EL 05/09/2026 ═══
//
//   node orquestador/scripts/censo-numeros-pegados.mjs
//   → Plantel   0 fórmulas · 400 números pegados   ⚠ VIOLA LA REGLA
//
// Cero fórmulas. La pestaña entera es el resultado de una corrida de `nomina-pestana.mjs` congelado
// en el instante en que corrió: si mañana alguien corrige una hora en `_J_OBREROS`, el Devengado
// 2026 de esa persona sigue diciendo lo de ayer y nada lo delata.
//
// ═══ PERO NO LOS 400 SON EL MISMO DEFECTO, Y ÉSA ES LA PARTE QUE HAY QUE PENSAR ═══
//
// La regla de oro 5 del dueño prohíbe el número CALCULADO y pegado. Un número pegado se defiende
// cuando es el ORIGEN del cálculo, y no se defiende cuando es una cuenta sobre celdas que ya están
// a la vista en la misma pestaña. Acá conviven las tres especies:
//
//   A · CUENTA SOBRE CELDAS DE LA MISMA PESTAÑA — indefendible. El «TOTAL AÑO» es la suma de los
//       doce meses que están tres columnas a la izquierda; «SALE DE LA CAJA» es D+E+F+G de su
//       propio renglón. Ésas son las que este módulo convierte en fórmula: la cuenta pasa a hacerla
//       Sheets y el número deja de poder envejecer.
//
//   B · EL MISMO NÚMERO PUBLICADO DOS VECES — indefendible por la regla 9 (no duplicar). «Horas
//       2026» y «Devengado 2026» del cuadro 1 son, celda por celda, las columnas «Horas» y «TOTAL
//       AÑO» del cuadro 2. Se convierten en una CITA (`=N28`), no en una segunda copia: el día que
//       las dos difieran, hoy no se enteraría nadie.
//
//   C · RESULTADO DE UN CÁLCULO QUE EL SHEET NO PUEDE REHACER — se queda pegado, declarado acá:
//       · los doce importes mensuales y las horas del cuadro 2 salen de reducir `_J_OBREROS` /
//         `_J_OFICINA` quincena por quincena, con la equivalencia de nombres del espejo. Traerlos
//         como SUMIFS es un trabajo con su propia evidencia, no un renglón de éste;
//       · vacaciones, SAC, SAC s/vacaciones y FCL salen de la antigüedad y del régimen de cada
//         persona (ley 22.250 vs. LCT). Es criterio laboral, no aritmética de planilla;
//       · «Liquidación (por recibo)» es `SALE DE LA CAJA × ACUERDO_BANCO`, y ACUERDO_BANCO es una
//         POLÍTICA del dueño (el 50% registrado) que hoy no tiene celda de parámetro en el archivo.
//         Escribirla como `=J51*0,5` no cumple la regla: cambia un número pegado por un parámetro
//         enterrado en una fórmula, que el checklist prohíbe igual. Se queda pegada hasta que la
//         política tenga su celda con rótulo y su rango con nombre.
//
// ═══ POR QUÉ LAS FILAS SE PASAN Y NO SE CALCULAN ═══
//
// Ninguna función de acá deduce en qué fila cae un cuadro. Quien genera la pestaña sabe la fila
// exacta porque acaba de empujar el renglón; deducirla de «el cuadro 1 empieza en la 7 y tiene N
// personas» es la aritmética de posición fija que este repositorio ya paga cara cada vez que alguien
// agrega una línea de subtítulo.

/** Las columnas de cada cuadro de «Plantel», por su letra en la pestaña. */
export const COLUMNAS = Object.freeze({
  quienes: Object.freeze({ horas: 'G', devengado: 'H', promedio: 'I' }),
  devengado: Object.freeze({ mesPrimero: 'B', mesUltimo: 'M', total: 'N', horas: 'O' }),
  costo: Object.freeze({ primerConcepto: 'D', ultimoConcepto: 'G', porRecibo: 'H', efectivo: 'I', sale: 'J', fondo: 'K' }),
})

/** Lo que se muestra donde no hay número. Es el mismo guion largo que ya usa el generador. */
export const SIN_DATO = '—'

const filaValida = (n, quien) => {
  if (!Number.isInteger(n) || n < 1) throw new Error(`${quien}: la fila tiene que ser un entero ≥ 1, llegó ${n}`)
  return n
}

/** `=SUM(C10:C20)` sobre una columna, entre dos filas inclusive. */
export function sumaDeColumna(col, desde, hasta) {
  filaValida(desde, 'sumaDeColumna'); filaValida(hasta, 'sumaDeColumna')
  if (hasta < desde) throw new Error(`sumaDeColumna: el rango ${col}${desde}:${col}${hasta} está dado vuelta`)
  return `=SUM(${col}${desde}:${col}${hasta})`
}

/**
 * La suma de una columna que muestra el HUECO en vez de un cero.
 *
 * Un mes sin jornales no vale $0: no hubo nada. El cero se lee como un dato y el guion como su
 * ausencia — y es lo que ya muestran los renglones de arriba, así que el total tiene que decir lo
 * mismo o la columna se contradice sola.
 */
export function sumaOGuion(col, desde, hasta) {
  const s = sumaDeColumna(col, desde, hasta).slice(1)
  return `=IF(${s}=0,"${SIN_DATO}",${s})`
}

/**
 * CUADRO 2 · lo devengado mes a mes. El «TOTAL AÑO» de una persona es la suma de sus doce meses.
 * @param {number} fila la fila de esa persona
 */
export function totalDelAnio(fila) {
  const { mesPrimero, mesUltimo } = COLUMNAS.devengado
  filaValida(fila, 'totalDelAnio')
  return `=SUM(${mesPrimero}${fila}:${mesUltimo}${fila})`
}

/**
 * CUADRO 1 · las tres columnas que hoy repiten o recalculan lo que el cuadro 2 ya publica.
 *
 * `promedio` divide el devengado por los meses en que esa persona tuvo importe — no por doce. Se
 * cuenta con `COUNTIF(...,">0")` sobre la misma fila del cuadro 2, que es exactamente lo que hacía
 * el generador en JavaScript; sin meses trabajados devuelve el guion, no una división por cero.
 *
 * @param {{filaEnDevengado:number}} o la fila de esta misma persona en el cuadro 2
 */
export function citasDelCuadroQuienes({ filaEnDevengado }) {
  const m = filaValida(filaEnDevengado, 'citasDelCuadroQuienes')
  const { mesPrimero, mesUltimo, total, horas } = COLUMNAS.devengado
  const meses = `COUNTIF(${mesPrimero}${m}:${mesUltimo}${m},">0")`
  return {
    horas: `=${horas}${m}`,
    devengado: `=${total}${m}`,
    promedio: `=IF(${meses}=0,"${SIN_DATO}",${total}${m}/${meses})`,
  }
}

/**
 * CUADRO 3 · qué cuesta desvincular. Las tres columnas que son aritmética del propio renglón.
 *
 * `sale` = vacaciones + SAC + SAC s/vacaciones + FCL no depositado, que son las cuatro columnas
 * contiguas D:G. `efectivo` = lo que sale menos lo que va por recibo, y NO se recalcula con el
 * porcentaje: si alguna vez la liquidación formal se corrige a mano, el efectivo tiene que moverse
 * con ella o las dos columnas dejan de sumar lo que el rótulo promete.
 *
 * `porRecibo` NO está acá a propósito — ver la especie C en la cabecera de este archivo.
 *
 * @param {number} fila
 */
export function cuentasDelCostoDeSalida(fila) {
  const f = filaValida(fila, 'cuentasDelCostoDeSalida')
  const { primerConcepto, ultimoConcepto, porRecibo, sale } = COLUMNAS.costo
  return {
    sale: `=SUM(${primerConcepto}${f}:${ultimoConcepto}${f})`,
    efectivo: `=${sale}${f}-${porRecibo}${f}`,
  }
}

/**
 * EL PROTOCOLO DE LA CITA, DONDE VIVE EL ÚNICO ERROR CARO POSIBLE: EL OFF-BY-ONE.
 *
 * El generador empuja los renglones del cuadro 1 antes de que exista el cuadro 2, y guarda el
 * ÍNDICE (0-based) de cada uno en su matriz. Las fórmulas hablan de FILAS (1-based). Mezclar las dos
 * numeraciones desplaza toda la columna una fila y publica el devengado de otra persona — con
 * números plausibles, sin un solo error a la vista, que es el modo de falla que este archivo
 * persigue. Por eso la conversión está acá, con test, y no suelta en el generador.
 *
 * @param {Array<Array<unknown>>} destino la matriz de filas de «Plantel», tal como se está armando
 * @param {{filaQuienes:number[], filaEnDevengado:number[]}} idx índices 0-based, en el mismo orden de personas
 */
export function citarCuadro2EnCuadro1(destino, { filaQuienes = [], filaEnDevengado = [] } = {}) {
  if (filaQuienes.length !== filaEnDevengado.length) {
    throw new Error(`citarCuadro2EnCuadro1: ${filaQuienes.length} persona(s) en el cuadro 1 y ${filaEnDevengado.length} en el cuadro 2`)
  }
  filaQuienes.forEach((idx, i) => {
    const renglon = destino[idx]
    if (!Array.isArray(renglon)) throw new Error(`citarCuadro2EnCuadro1: no hay fila en el índice ${idx}`)
    const c = citasDelCuadroQuienes({ filaEnDevengado: filaEnDevengado[i] + 1 })
    renglon[6] = c.horas
    renglon[7] = c.devengado
    renglon[8] = c.promedio
  })
  return destino
}
