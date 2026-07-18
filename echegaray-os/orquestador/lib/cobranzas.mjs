// Capacidad-DECISIÓN: estado de cobranzas (percibido/ingresos). Sobre public.cobranzas, que
// espeja 02_Cobranzas con reconciliación $0. Da lo cobrado, lo por cobrar, las VENCIDAS, la
// proyección de 7 días y el DSO real — todo del dato, nada inventado. 0 API.
import { query } from './db.mjs'

const COBRADO = new Set(['Cobrado', 'Efectivo'])
const dias = (d) => Math.floor(new Date(d).getTime() / 86400000)

/** CORE PURO (testeable sin DB): analiza filas de cobranzas a una fecha. */
export function analizarCobranzas(hoy, filas) {
  const hoyD = dias(hoy)
  let cobrado = 0, porCobrar = 0, vencido = 0, prox7 = 0, nCobradas = 0
  const dsoList = []
  const vencidas = []
  for (const f of filas) {
    const t = Number(f.total_bruto || 0)
    if (COBRADO.has(f.estado)) {
      cobrado += t; nCobradas++
      if (f.fecha_emision && f.fecha_cobro) dsoList.push(dias(f.fecha_cobro) - dias(f.fecha_emision))
    } else {
      porCobrar += t
      if (f.fecha_cobro) {
        const fc = dias(f.fecha_cobro)
        if (fc < hoyD) { vencido += t; vencidas.push({ obra: f.obra_cliente, monto: t, fecha_cobro: f.fecha_cobro, estado: f.estado }) }
        else if (fc <= hoyD + 7) prox7 += t
      }
    }
  }
  const dso = dsoList.length ? Math.round(dsoList.reduce((a, b) => a + b, 0) / dsoList.length) : null
  return {
    cobrado, por_cobrar: porCobrar, vencido, entra_7_dias: prox7,
    dso_dias: dso, n_cobradas: nCobradas,
    vencidas: vencidas.sort((a, b) => b.monto - a.monto).slice(0, 8),
  }
}

/** Capacidad pública: estado de cobranzas a hoy. 0 API. */
export async function estadoCobranzas(hoy = new Date()) {
  const { rows } = await query(
    `select estado, total_bruto, fecha_emision, fecha_cobro, obra_cliente
       from public.cobranzas where origen='cobranzas_sheet'`)
  const a = analizarCobranzas(hoy, rows)
  return { ...a, total_registros: rows.length, fuente: '02_Cobranzas (reconciliado $0)' }
}
