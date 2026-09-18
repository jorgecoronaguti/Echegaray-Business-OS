// EL PLAN DEL BISTURÍ SOBRE LA FILA DE UN MES DEL BLOQUE DE DIRECCIÓN — puro, sin red.
//
// ═══ POR QUÉ UN BISTURÍ Y NO EL GENERADOR (18/09/2026) ═══
//
// El dueño autorizó, para los retiros parciales de agosto, exactamente esto: que la fila de agosto del
// bloque de Dirección lea los pagos de `_PAGOS_NO_COMPRA_RAW` y muestre «parcial» con el resto. Correr
// `jornales-pestana.mjs` entero sobre el Sheet real para eso está prohibido (rules/sheets.md: ya borró
// trabajo del dueño tres veces). Se escriben las CUATRO celdas de esa fila que cambian de fórmula —
// Pagado (C), Estado (D), Se paga el (E) y Proyectado (H)— y nada más. Las cuatro y no dos: sin C y E
// leyendo la pestaña nueva, D y H no tienen de dónde sacar lo pagado y no cambian nada.
//
// TODO SE UBICA POR RÓTULO; si falta un ancla, no hay plan. Y cada celda se prueba del OS antes de
// tocarla: tiene que contener la fórmula con la FORMA que el generador escribe (o ya la nueva). Un
// número tipeado, un texto o una fórmula de otra forma es del dueño y frena el plan entero.

import { formulaProyectadoMes, formulaEstadoMes, retirosDeDireccion } from './direccion-retiros.mjs'

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const norm = (v) => String(v ?? '').trim().toLowerCase()
/**
 * NÚCLEO PURO: la fórmula como la devuelve la API, para compararla con la que se genera. Sheets guarda
 * `Compras!` donde se escribió `'Compras'!` (quita las comillas cuando el nombre no las necesita) y las
 * deja en `'_BANCO_RAW'!`. Sin esto, la celda viva nunca es «igual» a la generada y el bisturí escribe
 * la misma fórmula en cada corrida.
 */
export const formaApi = (f) => String(f ?? '').replace(/'([A-Za-z0-9_]+)'!/g, '$1!')

/**
 * NÚCLEO PURO: ubica el bloque y arma las cuatro celdas de un mes.
 *
 * @param {Array<Array>} formulas la pestaña leída con render FORMULA desde A1 (una fórmula es su texto)
 * @param {object} cols las columnas de Compras resueltas por rótulo (`columnasRetiros`)
 * @param {{ mes: string, anio: number }} cual
 * @returns {{ ok: boolean, motivo?: string, fila?: number, filaTotal?: number, celdas?: Array<{celda:string, actual:string, nueva:string, igual:boolean}> }}
 */
export function planMesParcial(formulas = [], cols, { mes, anio }) {
  const iMes = MESES.indexOf(mes)
  if (iMes < 0) return { ok: false, motivo: `mes desconocido: ${mes}` }
  const A = (i) => norm(formulas[i]?.[0])
  const iBloque = formulas.findIndex((_, i) => A(i).startsWith('1.2') && A(i).includes('direcci'))
  if (iBloque < 0) return { ok: false, motivo: 'no encontré el bloque «1.2 · Dirección»' }
  const iTotal = formulas.findIndex((_, i) => i > iBloque && A(i) === '⇒ retiro mensual de dirección')
  if (iTotal < 0) return { ok: false, motivo: 'no encontré «⇒ Retiro mensual de Dirección»' }
  const iEnc = formulas.findIndex((_, i) => i > iTotal && A(i) === 'mes')
  if (iEnc < 0) return { ok: false, motivo: 'no encontré el encabezado «Mes» del bloque de Dirección' }
  const enc = (formulas[iEnc] ?? []).map(norm)
  if (enc[2] !== 'pagado' || enc[3] !== 'estado' || enc[4] !== 'se paga el' || enc[7] !== 'proyectado') {
    return { ok: false, motivo: `el encabezado del bloque no es el conocido: ${JSON.stringify(formulas[iEnc])}` }
  }
  const iFila = formulas.findIndex((_, i) => i > iEnc && i <= iEnc + 12 && A(i) === norm(mes))
  if (iFila < 0) return { ok: false, motivo: `no encontré la fila «${mes}» del bloque de Dirección` }
  const r = iFila + 1
  const fTotal = iTotal + 1
  const { formulaPagadoMes, formulaSePagaElDireccion } = retirosDeDireccion(cols)
  const nuevas = {
    C: formulaPagadoMes(iMes + 1, anio),
    D: formulaEstadoMes(`C${r}`, `H${r}`),
    E: formulaSePagaElDireccion(iMes + 1, anio),
    H: formulaProyectadoMes(`E${r}`, `C${r}`, `$B$${fTotal}`, `$E$${fTotal}`, `B${r}`),
  }
  // LA PRUEBA DE PROPIEDAD: la forma con la que el generador escribió cada celda hasta hoy.
  const formaVieja = {
    C: (f) => f.startsWith('=SUMPRODUCT(REGEXMATCH(LOWER(Compras!'),
    D: (f) => f.startsWith(`=IF(N(C${r})>0;"pagado";IF(N(H${r})>0;"proyección";""))`),
    E: (f) => f.startsWith('=IFERROR(MAX(FILTER(Compras!'),
    H: (f) => f.startsWith(`=IF(N($B$${fTotal})=0;"";IF(N(C${r})>0;"";IF(E${r}<$E$${fTotal};"";`),
  }
  const colIdx = { C: 2, D: 3, E: 4, H: 7 }
  const celdas = []
  for (const [col, nueva] of Object.entries(nuevas)) {
    const actual = formaApi(formulas[iFila]?.[colIdx[col]])
    const igual = actual === formaApi(nueva)
    if (!igual && !formaVieja[col](actual)) {
      return { ok: false, fila: r, motivo: `${col}${r} no tiene la fórmula del generador: la tomo como tuya y no la toco (${actual.slice(0, 60) || 'vacía'})` }
    }
    celdas.push({ celda: `${col}${r}`, actual, nueva, igual })
  }
  return { ok: true, fila: r, filaTotal: fTotal, celdas }
}
