// EL AGING DE LA DEUDA CON PROVEEDORES.
//
// Una lista de proveedores ordenada por monto contesta "a quién le debo más". No contesta la
// pregunta que decide: "qué se me viene encima". El estándar de una posición de cuentas a pagar
// —el que usa cualquier mesa financiera— es el AGING: la deuda partida por vencimiento, con lo
// vencido arriba. Sin eso, un saldo chico que venció hace 40 días pesa lo mismo que uno grande que
// vence dentro de dos meses, y no es lo mismo.
//
// ═══ POR QUÉ VIVE EN COMPRAS Y NO EN PROVEEDORES ═══
//
// Una tabla dinámica nativa sólo puede agrupar por columnas de SU ORIGEN. Si el tramo de
// vencimiento se calculara en la pestaña Proveedores, la dinámica no podría verlo. Va como columna
// derivada al final de Compras —igual que `CUIT (OS)`—: una sola ancla con ARRAYFORMULA, después de
// todo lo que existe, así no desplaza ni pisa nada del dueño.
//
// ═══ EL TRAMO SE ORDENA SOLO ═══
//
// El rótulo lleva un número adelante ("1 · Vencido") porque una dinámica ordena alfabéticamente y
// "Vencido" caería después de "8 a 30 días". El número no es decoración: es lo que pone lo urgente
// arriba sin que nadie ordene a mano.
//
// ═══ SÓLO LAS FILAS CON SALDO ═══
//
// El tramo se calcula contra `Saldo pendiente (OS)` (columna AL), no contra el total de la factura.
// Una factura pagada no tiene vencimiento: si entrara con su tramo, el aging sumaría plata que ya
// salió. Por eso las filas sin saldo devuelven vacío y la dinámica las descarta sola.

/** Columnas de Compras usadas por el aging. Índice 0 = A. */
export const COL = Object.freeze({
  proveedor: 4, // E
  fechaPago: 16, // Q — Fecha prevista de pago (día)
  saldo: 37, // AL — Saldo pendiente (OS)
  aging: 39, // AN — la que escribe esta capacidad
})

/** El corte de cada tramo, en días desde hoy. `null` = sin techo. */
export const TRAMOS = Object.freeze([
  { hasta: -1, rotulo: '1 · Vencido' },
  { hasta: 7, rotulo: '2 · Vence esta semana' },
  { hasta: 30, rotulo: '3 · 8 a 30 días' },
  { hasta: 60, rotulo: '4 · 31 a 60 días' },
  { hasta: null, rotulo: '5 · Más de 60 días' },
])

export const SIN_FECHA = '6 · Sin fecha de pago'

/**
 * El tramo de una fila, en JS. Existe para poder testear el criterio sin Google:
 * la fórmula de abajo tiene que dar exactamente esto.
 * @param {{saldo:number, fechaPago:Date|null}} fila
 * @param {Date} hoy
 * @returns {string} el rótulo, o '' si la fila no tiene deuda
 */
export function tramoDeLaFila({ saldo, fechaPago } = {}, hoy = new Date()) {
  if (!(Math.round(Number(saldo) || 0) > 0)) return ''
  if (!(fechaPago instanceof Date) || Number.isNaN(fechaPago.getTime())) return SIN_FECHA
  const dias = Math.round((fechaPago.getTime() - hoy.getTime()) / 86400000)
  for (const t of TRAMOS) if (t.hasta === null || dias <= t.hasta) return t.rotulo
  return SIN_FECHA
}

/**
 * La misma decisión, como ARRAYFORMULA en es-AR (separador `;`).
 * Se ancla en AN4 y derrama sola: escribir el derrame rompería la fórmula entera.
 */
export function formulaAging() {
  const saldo = '$AL$4:$AL'
  const fecha = '$Q$4:$Q'
  const anidar = (i) => {
    const t = TRAMOS[i]
    if (t.hasta === null) return `"${t.rotulo}"`
    const corte = t.hasta === -1 ? 'TODAY()' : `TODAY()+${t.hasta}`
    const cmp = t.hasta === -1 ? `${fecha}<${corte}` : `${fecha}<=${corte}`
    return `IF(${cmp};"${t.rotulo}";${anidar(i + 1)})`
  }
  return (
    '=ARRAYFORMULA(' +
    `IF($E$4:$E="";"";` +
    `IF(NOT(ISNUMBER(${saldo}));"";` +
    `IF(ROUND(${saldo};0)<=0;"";` +
    `IF(NOT(ISNUMBER(${fecha}));"${SIN_FECHA}";` +
    anidar(0) +
    ')))))'
  )
}

/** El rótulo de la columna en Compras. */
export const ROTULO = 'Tramo de vencimiento (OS)'
