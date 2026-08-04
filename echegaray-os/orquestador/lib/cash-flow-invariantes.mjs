// LOS INVARIANTES DE UN CASH FLOW — núcleo puro, no lee nada.
//
// POR QUÉ EXISTE (04/08). Conciliar línea por línea contra la fuente prueba que cada número está bien
// traído. No prueba que el CUADRO esté bien: un subtotal puede sumar a un hijo dos veces, el total
// del año puede sumar la columna "Total 2026" sobre sí misma, y la cadena de saldos puede arrancar de
// un ancla que no corresponde. Eso no lo detecta ninguna conciliación de línea — lo detecta la
// aritmética del cuadro contra sí misma, que es lo que hay acá.
//
// LA COLUMNA "Total 2026" NO ES UN PERÍODO. Tres celdas de la fila del ancla ya se rompieron por
// contarla como uno. Por eso ningún recorrido de este archivo itera columnas: itera los períodos que
// `columnasDePeriodo` reconoce, y ésos son sólo los que tienen una fecha real en el encabezado.

const esNum = (v) => typeof v === 'number' && Number.isFinite(v)
const num = (v) => (esNum(v) ? v : 0)

/**
 * Las columnas que SON un período, leídas del encabezado. Devuelve serial y todo.
 * Un encabezado de texto ("Total 2026", "Nota", "Real (Compras)") no es un período y queda afuera.
 */
export function columnasDePeriodo(filaEncabezado = []) {
  const cols = []
  for (let c = 1; c < filaEncabezado.length; c++) {
    if (esNum(filaEncabezado[c]) && filaEncabezado[c] > 40000) cols.push({ col: c, serial: filaEncabezado[c] })
  }
  return cols
}

/** Mes calendario (1..12) y año de un serial de Sheets. */
export function mesDeSerial(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}

/**
 * INVARIANTE 1 — la cadena de caja: inicio + neto = cierre, y cierre(n) = inicio(n+1).
 *
 * Se saltean los períodos con el inicio vacío: antes del ancla el cuadro deja la celda en blanco a
 * propósito (no se conoce el saldo de un mes que ya pasó), y exigir la identidad ahí inventaría fallas.
 */
export function cadenaDeCaja(inicio = [], neto = [], cierre = [], cols = [], tolerancia = 1) {
  const fallas = []
  let previo = null
  for (const { col, serial } of cols) {
    const i = inicio[col]
    if (!esNum(i)) { previo = null; continue }
    const c = cierre[col]
    const esperado = i + num(neto[col])
    if (!esNum(c) || Math.abs(c - esperado) > tolerancia) {
      fallas.push({ tipo: 'inicio+neto≠cierre', col, serial, celda: num(c), esperado, diferencia: num(c) - esperado })
    }
    if (previo !== null && Math.abs(i - previo) > tolerancia) {
      fallas.push({ tipo: 'cierre(n)≠inicio(n+1)', col, serial, celda: i, esperado: previo, diferencia: i - previo })
    }
    previo = esNum(c) ? c : null
  }
  return fallas
}

/**
 * INVARIANTE 2 — cada subtotal es la suma de SUS componentes.
 * @param {Array<{fila:number, hijos:number[], concepto:string}>} mapa filas 1-indexadas
 */
export function subtotales(grid = [], mapa = [], cols = [], tolerancia = 1) {
  const fallas = []
  for (const { fila, hijos, concepto } of mapa) {
    for (const { col, serial } of cols) {
      const padre = num((grid[fila - 1] || [])[col])
      const suma = hijos.reduce((a, h) => a + num((grid[h - 1] || [])[col]), 0)
      if (Math.abs(padre - suma) > tolerancia) {
        fallas.push({ concepto, fila, col, serial, celda: padre, esperado: suma, diferencia: padre - suma })
      }
    }
  }
  return fallas
}

/** INVARIANTE 3 — la columna del total del año es la suma de los períodos, fila por fila. */
export function totalAnual(grid = [], filas = [], cols = [], colTotal, tolerancia = 1) {
  const fallas = []
  for (const { fila, concepto } of filas) {
    const f = grid[fila - 1] || []
    const suma = cols.reduce((a, { col }) => a + num(f[col]), 0)
    const total = num(f[colTotal])
    if (Math.abs(total - suma) > tolerancia) {
      fallas.push({ concepto, fila, celda: total, esperado: suma, diferencia: total - suma })
    }
  }
  return fallas
}

/**
 * INVARIANTE 4 — la suma de las semanas de un mes contra ese mes.
 *
 * UNA SEMANA CRUZA EL FIN DE MES y sus movimientos caen a los dos lados: se la asigna al mes de su
 * lunes y se informa cuáles son, porque la diferencia que aportan es de convención, no un defecto.
 * El número que decide es el del año, donde los bordes se cancelan.
 */
export function semanasPorMes(colsSemanales = [], anio) {
  const porMes = new Map()
  const cruzadas = []
  for (const c of colsSemanales) {
    const ini = mesDeSerial(c.serial)
    const fin = mesDeSerial(c.serial + 6)
    if (ini.anio !== anio && fin.anio !== anio) continue
    const mes = ini.anio === anio ? ini.mes : fin.mes
    if (ini.mes !== fin.mes || ini.anio !== fin.anio) cruzadas.push({ ...c, desde: ini, hasta: fin, asignadaA: mes })
    if (!porMes.has(mes)) porMes.set(mes, [])
    porMes.get(mes).push(c)
  }
  return { porMes, cruzadas }
}

/** Compara una fila entre los dos cuadros, mes a mes y en el año. */
export function cuadreDeFila(filaMensual = [], filaSemanal = [], colsMensuales = [], porMes = new Map()) {
  const meses = []
  let mensualAnio = 0
  let semanalAnio = 0
  for (const { col, serial } of colsMensuales) {
    const mes = mesDeSerial(serial).mes
    const mensual = num(filaMensual[col])
    const semanal = (porMes.get(mes) || []).reduce((a, c) => a + num(filaSemanal[c.col]), 0)
    mensualAnio += mensual
    semanalAnio += semanal
    meses.push({ mes, mensual, semanal, diferencia: mensual - semanal })
  }
  return { meses, mensualAnio, semanalAnio, diferenciaAnio: mensualAnio - semanalAnio }
}
