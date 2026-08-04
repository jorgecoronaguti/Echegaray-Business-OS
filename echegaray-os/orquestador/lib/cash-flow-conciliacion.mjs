// RECONSTRUIR CADA LÍNEA DEL CASH FLOW POR AFUERA — núcleo puro, no lee ni escribe nada.
//
// POR QUÉ EXISTE (04/08). El dueño pidió "máxima certeza en ambos cash flows, conciliar cada valor".
// Un cuadro que se audita con sus propias fórmulas no se audita: si el SUMIFS toma la columna
// equivocada, el control que lo lee toma la misma columna equivocada y confirma el error. La única
// verificación que vale es rehacer el número desde la pestaña de origen, con otro código, y comparar.
//
// Por eso acá no hay ni una referencia a una celda del cash flow: cada función recibe las FILAS de la
// pestaña fuente y devuelve el importe que debería estar en la celda. El script que las usa lee la
// celda aparte y resta. La diferencia es el hallazgo.
//
// LOS ÍNDICES SON EL CONTRATO. Se declaran acá arriba con su letra de columna porque son lo primero
// que se rompe cuando alguien inserta una columna en la pestaña fuente — y cuando eso pasa, un
// SUMIFS no da error: da otro número.

/** Columnas de cada pestaña fuente, 0-indexadas. La letra es la que se ve en el Sheet. */
export const COL = {
  compras: { total: 14, rubro: 28, fechaCaja: 29, subrubro: 31 }, // O · AC · AD · AF
  cobranzas: { unidad: 5, monto: 12, estado: 14, fechaVenta: 15, fechaCobro: 16, endoso: 53 }, // F·M·O·P·Q·BB
  cheques: { monto: 5, fechaPago: 8, estadoOS: 12 }, // F · I · M
  tarjeta: { monto: 4, fechaPago: 7, estadoOS: 11 }, // E · H · L
  banco: { fecha: 0, importe: 2, sentido: 4, naturaleza: 5 }, // A · C · E · F
}

/** El rótulo exacto que el OS escribe cuando un pago no tiene su factura en Compras. */
export const SIN_FACTURA = '⚠ FALTA cargar la factura en Compras — este pago no lo ve el cash flow'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const esNum = (v) => typeof v === 'number' && Number.isFinite(v)
const texto = (v) => String(v ?? '').trim().toLowerCase()

/** Serial de Sheets → {anio, mes} en UTC. El epoch de Sheets es 30/12/1899. */
export function serialAMes(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

/** Una fecha calendario → serial de Sheets. `mes` es 1..12 y admite 13 (= enero del año siguiente). */
export function serialDeFecha(anio, mes, dia = 1) {
  return Math.round((Date.UTC(anio, mes - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000)
}

/** EOMONTH(serial;0)+1 — el primer serial del mes SIGUIENTE, que es el borde superior abierto. */
export function inicioMesSiguiente(serial) {
  const { anio, mes } = serialAMes(serial)
  const d = Date.UTC(anio, mes, 1) // mes ya viene 1-indexado, así que esto es el 1° del siguiente
  return Math.round((d - Date.UTC(1899, 11, 30)) / 86400000)
}

/**
 * NÚCLEO: sumar una columna de importes de las filas cuya fecha cae en [desde, hasta).
 *
 * `fecha` puede ser una función porque varias líneas del cuadro eligen la fecha en cascada (cobranzas:
 * fecha de cobro si es número, si no fecha de venta). Esa cascada es criterio de negocio y se
 * reconstruye igual que el resto: si el cuadro la aplica y acá no, la diferencia sería inventada.
 */
export function sumarVentana(filas = [], { fecha, monto, filtro, desde, hasta }) {
  let total = 0
  const usadas = []
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] || []
    if (filtro && !filtro(f)) continue
    const d = typeof fecha === 'function' ? fecha(f) : f[fecha]
    if (!esNum(d) || d < desde || d >= hasta) continue
    const m = typeof monto === 'function' ? monto(f) : num(f[monto])
    total += m
    usadas.push({ i, fecha: d, monto: m })
  }
  return { total, usadas }
}

/** La fecha con la que el cash flow ubica una cobranza: cobro real, si no la de venta. */
export function fechaDeCobro(fila = []) {
  const c = COL.cobranzas
  if (esNum(fila[c.fechaCobro])) return fila[c.fechaCobro]
  if (esNum(fila[c.fechaVenta])) return fila[c.fechaVenta]
  return null
}

/**
 * Cobranzas de la ventana. `cobrado:true` = lo ya percibido; `false` = lo esperado.
 *
 * EL FILTRO DE ENDOSO NO ES UN DETALLE: un cheque endosado a un proveedor nunca entró a la cuenta.
 * Contarlo como cobro infla el ingreso y después infla el saldo. El cuadro lo excluye por dos vías
 * distintas (columna BB empieza con "ENDOSADO", o el estado dice "endosado") y acá se replican las dos.
 */
export function conciliarCobranzas(filas = [], { unidad, cobrado, desde, hasta, desdeFila = 4 }) {
  const c = COL.cobranzas
  const enUnidad = (f) => {
    const u = texto(f[c.unidad])
    if (unidad === 'otras') return u !== 'civil' && u !== 'mantenimiento'
    return u === unidad
  }
  return sumarVentana(filas.slice(desdeFila), {
    fecha: fechaDeCobro,
    monto: (f) => num(f[c.monto]),
    desde,
    hasta,
    filtro: (f) => enUnidad(f)
      && String(f[c.endoso] ?? '').slice(0, 8) !== 'ENDOSADO'
      && (cobrado ? texto(f[c.estado]) === 'cobrado' : texto(f[c.estado]) !== 'cobrado' && texto(f[c.estado]) !== 'endosado'),
  })
}

/**
 * Compras de la ventana por rubro de caja (AC) o por sub-rubro de estructura (AF).
 * SIEMPRE por FECHA DE CAJA (AD), nunca por fecha de factura: el cash flow es percibido.
 */
export function conciliarCompras(filas = [], { rubro, subrubro, desde, hasta, desdeFila = 3 }) {
  const c = COL.compras
  return sumarVentana(filas.slice(desdeFila), {
    fecha: c.fechaCaja,
    monto: c.total,
    desde,
    hasta,
    filtro: (f) => (rubro === undefined || String(f[c.rubro] ?? '') === rubro)
      && (subrubro === undefined || String(f[c.subrubro] ?? '') === subrubro),
  })
}

/** Estructura neta: el rubro "Estructura" MENOS lo que es inversión, que va en otro bloque del cuadro. */
export function conciliarEstructuraNeta(filas = [], ventana) {
  const bruto = conciliarCompras(filas, { rubro: 'Estructura', ...ventana })
  const inversion = conciliarCompras(filas, { subrubro: 'Equipos y rodados (inversión)', ...ventana })
  return { total: bruto.total - inversion.total, bruto: bruto.total, inversion: inversion.total }
}

/** Pagos con instrumento cuya factura NO está en Compras: si no se suman acá, no los ve nadie. */
export function conciliarSinFactura(filas = [], { tipo, desde, hasta, desdeFila }) {
  const c = tipo === 'tarjeta' ? COL.tarjeta : COL.cheques
  const base = desdeFila ?? (tipo === 'tarjeta' ? 31 : 1)
  return sumarVentana(filas.slice(base), {
    fecha: c.fechaPago,
    monto: c.monto,
    desde,
    hasta,
    filtro: (f) => String(f[c.estadoOS] ?? '') === SIN_FACTURA,
  })
}

/** Movimientos del extracto por naturaleza. `sentido` sólo se exige cuando el cuadro lo exige. */
export function conciliarBanco(filas = [], { naturaleza, sentido, desde, hasta, desdeFila = 3 }) {
  const c = COL.banco
  return sumarVentana(filas.slice(desdeFila), {
    fecha: c.fecha,
    monto: (f) => (sentido ? Math.abs(num(f[c.importe])) : num(f[c.importe])),
    desde,
    hasta,
    filtro: (f) => String(f[c.naturaleza] ?? '') === naturaleza
      && (sentido === undefined || texto(f[c.sentido]) === sentido),
  })
}

/**
 * Jornales: reales + proyectados, con la misma cascada de fecha que el cuadro.
 * Real: "Pagado el" (N), si no "Se paga el" (C), si no "Hasta" (B). Proyectado: "Se paga el", si no "Hasta".
 * @param {Array<Array>} bloques [[hasta, pago, pagado, total], ...] ya extraídos de los rangos con nombre
 */
export function conciliarJornales(reales = [], proyectados = [], { desde, hasta }) {
  const fechaReal = (r) => (esNum(r.pagado) ? r.pagado : esNum(r.pago) ? r.pago : r.hasta)
  const fechaProy = (r) => (esNum(r.pago) ? r.pago : r.hasta)
  const suma = (rs, fn) => rs.reduce((a, r) => {
    const d = fn(r)
    return esNum(d) && d >= desde && d < hasta ? a + num(r.total) : a
  }, 0)
  const real = suma(reales, fechaReal)
  const proy = suma(proyectados, fechaProy)
  return { total: real + proy, real, proyectado: proy }
}

/**
 * Sueldos de oficina + retiros de dirección: PAGADO y PROYECTADO se SUMAN, no se eligen.
 *
 * Es a propósito y es frágil: si un mes tuviera valor en las dos columnas, el cuadro lo contaría dos
 * veces. Se reconstruye igual que el cuadro y además se informa cuántas filas tienen las dos, que es
 * el defecto que esta forma habilita.
 */
export function conciliarSueldos(filas = [], { desde, hasta }) {
  let total = 0
  let dobles = 0
  for (const f of filas) {
    if (!esNum(f.pago) || f.pago < desde || f.pago >= hasta) continue
    if (num(f.pagado) !== 0 && num(f.proyectado) !== 0) dobles++
    total += num(f.pagado) + num(f.proyectado)
  }
  return { total, dobles }
}

/** Impuesto al cheque: 0,6% de la suma de las líneas que mueven la cuenta. */
export function impuestoAlCheque(componentes = []) {
  return componentes.reduce((a, v) => a + num(v), 0) * 0.006
}

/**
 * COBRADO CON FECHA DE COBRO FUTURA — el cuadro lo afirma como HECHO y todavía no pasó.
 *
 * No es un error de fórmula: la fórmula hace exactamente lo que le pidieron. Es un error de CRITERIO
 * en el dato, y sale caro porque estas filas entran en "ya cobrado", que es la línea con la que se
 * decide si alcanza para pagar. Si el cliente no paga, el saldo proyectado no existe.
 */
export function cobradasConFechaFutura(filas = [], hoy, desdeFila = 4) {
  const c = COL.cobranzas
  const casos = []
  for (const f of filas.slice(desdeFila)) {
    if (!f || texto(f[c.estado]) !== 'cobrado') continue
    const d = fechaDeCobro(f)
    if (esNum(d) && d > hoy) casos.push({ cliente: String(f[6] ?? ''), monto: num(f[c.monto]), fecha: d })
  }
  return { total: casos.reduce((a, x) => a + x.monto, 0), casos }
}

/**
 * PENDIENTE CON FECHA ANTERIOR AL MES EN CURSO — plata por cobrar que el cuadro NO muestra.
 *
 * La línea de cobranzas esperadas tiene una compuerta (`>= EOMONTH(TODAY();-1)+1`) que apaga los
 * meses ya pasados para no proyectar hacia atrás. El efecto lateral es que una factura vencida y no
 * cobrada desaparece del cuadro entero: no está en "ya cobrado" porque no se cobró, y no está en
 * "esperado" porque su fecha quedó atrás.
 */
export function pendientesFueraDeVentana(filas = [], inicioMesActual, desdeFila = 4) {
  const c = COL.cobranzas
  const casos = []
  for (const f of filas.slice(desdeFila)) {
    if (!f) continue
    const est = texto(f[c.estado])
    if (!est || est === 'cobrado' || est === 'endosado') continue
    const d = fechaDeCobro(f)
    if (esNum(d) && d < inicioMesActual && num(f[c.monto]) !== 0) {
      casos.push({ cliente: String(f[6] ?? ''), monto: num(f[c.monto]), fecha: d, estado: est })
    }
  }
  return { total: casos.reduce((a, x) => a + x.monto, 0), casos }
}

/**
 * El RITMO de un rubro: promedio mensual de los últimos meses CERRADOS.
 *
 * Es el mismo modelo con el que el cuadro proyecta los meses futuros, rehecho por afuera. Sirve para
 * medir cuánto le falta al MES EN CURSO, que el cuadro trata como si ya hubiera terminado: al 4 de un
 * mes de 31 días, lo cargado no es el mes, es el 13% del mes.
 */
export function ritmoMensual(compras = [], { rubro, subrubro, inicioMesActual, meses = 3 }) {
  const desde = (() => {
    const { anio, mes } = serialAMes(inicioMesActual)
    return serialDeFecha(anio, mes - meses, 1)
  })()
  const { total } = conciliarCompras(compras, { rubro, subrubro, desde, hasta: inicioMesActual })
  return { promedio: total / meses, ventana: { desde, hasta: inicioMesActual }, total }
}
