// LAS COLUMNAS DE PAGO DE COMPRAS SE CONTRADICEN ENTRE SÍ.
//
// POR QUÉ EXISTE (21/07). La auditoría de reglas de oro marcaba 10 columnas de Compras "cargadas y
// no leídas". Fui a ver si el OS debía empezar a leerlas y la respuesta es NO — y el motivo es el
// hallazgo:
//
//   · 668 filas dicen Estado = "Pagado"
//   · de ésas, 128 tienen "Monto Pagado" (T) distinto del Total (O)
//   · y en casi todas, T = 0
//
// O sea: la fila afirma que se pagó y la columna del monto pagado está vacía. No son dos datos que
// difieren, es un dato que falta. Si el cash flow empezara a sumar T en vez de O, esas 128 compras
// —$12.746.022— desaparecerían del cuadro. Leer una columna a medio llenar es peor que no leerla.
//
// LA DECISIÓN, ENTONCES: el OS NO consume estas columnas. Las CONTROLA. Muestra la contradicción
// para que se resuelva en el origen, que es donde corresponde. El día que la carga esté completa,
// pasar el cash flow a "monto pagado" es un cambio de una línea.
//
// ═══ EL CASO QUE SÍ ES UN ERROR DEL CUADRO ═══
//
// Un pago PARCIAL con segunda cuota tiene dos importes y dos fechas (T/Q y W/V). El cash flow suma
// el total O en UNA sola fecha de caja, así que la segunda cuota queda en el mes equivocado. Es
// chico —está acotado por la columna W— pero es un error de criterio, no de carga: el cuadro es de
// caja y está ubicando plata cuando no sale.

/** Los estados de la columna X que afirman que la compra se pagó. */
const PAGADO = /pagad/i

/** Marca de pago parcial en la columna S. */
const PARCIAL = /parcial/i

/**
 * NÚCLEO PURO: las filas que dicen "Pagado" pero no dicen cuánto se pagó.
 * @param {Array<{fila:number, total:number, pagado:number, estado:string}>} filas
 */
export function pagadasSinMonto(filas = []) {
  return filas.filter((f) => PAGADO.test(f.estado ?? '') && (Number(f.total) || 0) > 0 && !(Number(f.pagado) > 0))
}

/**
 * NÚCLEO PURO: las filas que dicen "Pagado" con un monto pagado MENOR al total.
 * Distinto del caso anterior: acá sí hay un número, y contradice al estado.
 */
export function pagadasIncompletas(filas = [], tolerancia = 1) {
  return filas.filter((f) => {
    const t = Number(f.total) || 0, p = Number(f.pagado) || 0
    return PAGADO.test(f.estado ?? '') && p > 0 && t - p > tolerancia
  })
}

/**
 * NÚCLEO PURO: los pagos parciales cuya segunda cuota el cash flow ubica en el mes equivocado.
 * Sólo cuentan los que tienen SEGUNDA FECHA distinta de la primera: si las dos cuotas caen en el
 * mismo mes, el cuadro no se equivoca aunque el detalle esté partido.
 */
export function segundaCuotaFueraDeMes(filas = []) {
  return filas.filter((f) => {
    if (!PARCIAL.test(f.tipoPago ?? '')) return false
    const w = Number(f.cuota2) || 0
    if (w <= 0) return false
    return mes(f.fechaCaja) !== mes(f.fecha2) && !!mes(f.fecha2)
  })
}

/** 'YYYY-MM' de una fecha en cualquiera de los formatos que llegan del Sheet. */
export function mes(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString().slice(0, 7)
  const s = String(v ?? '').trim()
  if (!s) return ''
  // es-AR: dd/mm/yyyy
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s)
  if (m) {
    const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    return `${a}-${String(m[2]).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  return ''
}

/** NÚCLEO PURO: el resumen para el bloque de control. */
export function resumen(filas = []) {
  const sinMonto = pagadasSinMonto(filas)
  const incompletas = pagadasIncompletas(filas)
  const cuota2 = segundaCuotaFueraDeMes(filas)
  const suma = (l, campo) => l.reduce((s, f) => s + (Number(f[campo]) || 0), 0)
  return {
    sinMonto: sinMonto.length, montoSinMonto: suma(sinMonto, 'total'),
    incompletas: incompletas.length,
    faltaPorPagar: incompletas.reduce((s, f) => s + ((Number(f.total) || 0) - (Number(f.pagado) || 0)), 0),
    cuota2: cuota2.length, montoCuota2: suma(cuota2, 'cuota2'),
  }
}
