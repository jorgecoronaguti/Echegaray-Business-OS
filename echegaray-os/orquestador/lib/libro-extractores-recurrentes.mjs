// LA PROVISIÓN DE LOS SERVICIOS RECURRENTES — el mes en curso también los debe (07/08/2026).
//
// El agujero, medido en vivo: la pestaña "Recurrentes" muestra el gasto mensual por proveedor y
// proyecta sept–dic, pero NADIE la lee — el libro no tenía un solo movimiento de Movistar, seguros
// ni honorarios recurrentes para el MES EN CURSO. Cuando la factura llegaba y se pagaba, la
// DISPONIBLE bajaba en vivo y la COMPROMETIDA ni se enteraba: la diferencia se la comía LIBRE.
// El dueño, textual: "te pasé comprobantes de pago de Movistar, es decir que en recurrentes debe
// impactar. y descontar de caja comprometida, porque está comprometida para pagar lo que se debe
// pagar el resto del mes".
//
// LA REGLA: cada proveedor con rubro "Servicios recurrentes" e historia suficiente genera una
// provisión PROYECTADA por mes — lo esperado (la MEDIANA de sus meses cerrados con gasto) menos lo
// que ya se materializó ese mes en Compras (pagado O pendiente: la fila real ya entra al libro por
// su propio camino, la provisión sólo cubre lo que TODAVÍA no llegó). La provisión se consume sola:
// factura real cargada → provisión más chica; mes completo → provisión $0. Nunca cuenta dos veces.
//
// MEDIANA y no promedio: un mes con doble factura (el ciclo corrido de Movistar) o un mes en cero
// no arrastran la expectativa. Y se exigen DOS meses cerrados con gasto como mínimo: un proveedor
// que apareció una vez no es un recurrente, es un gasto que pasó por el rubro.
import { movimiento, SALE } from './libro-movimientos.mjs'
import { columnasDeCompras } from './libro-extractores-compras.mjs'
import { fechaDeSerial, serialDe, finDeMes } from './libro-extractores-fechas.mjs'

export const RUBRO_RECURRENTES = 'Servicios recurrentes'
export const MESES_MINIMOS = 2

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Las provisiones de recurrentes: un movimiento PROYECTADO por proveedor y por mes, desde el mes en
 * curso hasta diciembre, neto de lo ya materializado en el mes en curso.
 *
 * @param {Array<Array<any>>} filas Compras entera (A1:AN, sin formatear) — la misma lectura del libro
 * @param {number} hoy serial de Sheets del día de la corrida
 * @param {(m:string)=>void} aviso
 */
export function deRecurrentes(filas = [], hoy = 0, aviso = () => {}) {
  const c = columnasDeCompras(filas)
  const d = fechaDeSerial(hoy)
  const anio = d.getUTCFullYear()
  const mesActual = d.getUTCMonth() + 1

  // El gasto por proveedor y por mes, por FECHA DE CAJA (la vista de caja: cuándo sale la plata).
  const porProveedor = new Map()
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    if (txt(f[c.rubro]) !== RUBRO_RECURRENTES) continue
    const fecha = num(f[c.fechaCaja])
    const importe = num(f[c.importe])
    if (fecha === null || importe === null) continue
    const fd = fechaDeSerial(fecha)
    if (fd.getUTCFullYear() !== anio) continue
    const prov = txt(f[c.proveedor]) || '(sin proveedor)'
    const mes = fd.getUTCMonth() + 1
    const p = porProveedor.get(prov) ?? { meses: new Map(), dias: [] }
    p.meses.set(mes, (p.meses.get(mes) ?? 0) + importe) // la nota de crédito resta sola: viene negativa
    p.dias.push(fd.getUTCDate())
    porProveedor.set(prov, p)
  }

  const out = []
  for (const [prov, p] of porProveedor) {
    // La expectativa sale de los meses CERRADOS con gasto real. Dos como mínimo.
    const cerrados = [...p.meses.entries()].filter(([m, t]) => m < mesActual && t > 0).map(([, t]) => t)
    if (cerrados.length < MESES_MINIMOS) continue
    const esperado = Math.round(mediana(cerrados) * 100) / 100
    if (esperado <= 0) continue
    const diaTipico = Math.round(mediana(p.dias)) || 5
    for (let mes = mesActual; mes <= 12; mes++) {
      // En el mes en curso la provisión es lo que FALTA: lo materializado (pagado o pendiente) ya
      // viaja al libro por su fila real de Compras — la provisión de un mes completo sería doble.
      const materializado = mes === mesActual ? (p.meses.get(mes) ?? 0) : 0
      const provision = Math.round(Math.max(0, esperado - materializado) * 100) / 100
      if (provision <= 0) continue
      // El día típico del proveedor, acotado al mes; en el mes en curso nunca antes de mañana — una
      // provisión con fecha pasada diría VENCIDO de algo que quizá ni facturaron todavía.
      const tope = finDeMes(anio, mes)
      let fecha = Math.min(serialDe(anio, mes, Math.min(diaTipico, 28)), tope)
      if (mes === mesActual && fecha <= hoy) fecha = Math.min(hoy + 1, tope)
      out.push(movimiento({
        fecha,
        importe: provision,
        signo: SALE,
        concepto: `Recurrente esperado · ${prov}`,
        contraparte: prov,
        rubro: RUBRO_RECURRENTES,
        estado: 'PROYECTADO',
        instrumento: '',
        obra: '',
        cliente: '',
        origen: { pestana: 'Recurrentes', fila: mes },
      }))
    }
  }
  if (out.length) {
    const mesTotal = out.filter((m) => fechaDeSerial(m.fecha).getUTCMonth() + 1 === mesActual)
      .reduce((a, m) => a + m.importe, 0)
    aviso(`recurrentes: ${porProveedor.size} proveedor(es) del rubro · provisión del mes en curso `
      + `$${Math.round(mesTotal).toLocaleString('es-AR')} (esperado − materializado, por proveedor)`)
  }
  return out
}
