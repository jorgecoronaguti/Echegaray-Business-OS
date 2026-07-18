// LECTOR DETERMINÍSTICO DE JORNALES — capa confiable sobre la planilla JORNALES (desordenada:
// quincenas apiladas en bloques delimitados por una fila de fechas; total por persona en una
// columna fija por pestaña). Reemplaza al modelo escaneando 10 bloques + web_search y dando un
// número MAL (leyó enero, dijo julio). Acá el número es determinístico y verificable.
export const JORNALES_ID = '1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'
// Columna de TOTAL PAGADO por persona, por pestaña (índice 0-based). Distintas porque el layout
// difiere entre obreros y oficina. Verificado contra el total que la propia planilla calcula.
export const TOTAL_COL = { 'Obreros 26': 26 /* AA */, 'Oficina 26': 25 /* Z */ }

const FECHA = /^\d{1,2}\/\d{1,2}$/
/** "D/M" → clave ordenable M*100+D (una quincena no cruza fin de año en un bloque). */
const claveFecha = (s) => { const [d, m] = String(s).split('/').map(Number); return (m || 0) * 100 + (d || 0) }
/** "$7.048.606" / "$448.800,00" (es-AR) → número. */
export function parseMonto(s) {
  const n = Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
/** Filas que ABREN un bloque de quincena = tienen ≥3 fechas DD/MM. */
export function filasDeBloque(values) {
  const out = []
  for (let i = 0; i < values.length; i++) {
    const r = values[i] || []
    if (r.filter((c) => FECHA.test(String(c).trim())).length >= 3) out.push(i)
  }
  return out
}
/** Suma el total pagado de la ÚLTIMA quincena (último bloque) de una pestaña. Devuelve las fechas
 *  de la quincena, personas contadas y total. Empleado = col A numérica + col B nombre (>2 chars).
 *  Corta el bloque al llegar a una fila de TOTAL/UOCRA/BANCO o al siguiente bloque. */
export function ultimaQuincena(values, totalColIdx) {
  const heads = filasDeBloque(values)
  if (!heads.length) return null
  const start = heads[heads.length - 1]
  // Las fechas del header pueden venir DESORDENADAS (ej. 16/7,17/7,18/7,6/7…): tomamos min/max
  // reales, no primera/última, para no rotular mal la quincena.
  const fechas = (values[start] || []).map((c) => String(c).trim()).filter((c) => FECHA.test(c))
    .sort((a, b) => claveFecha(a) - claveFecha(b))
  let total = 0, personas = 0
  const detalle = []
  for (let i = start + 1; i < values.length; i++) {
    const r = values[i] || []
    const nombre = String(r[1] ?? '').trim()
    const esEmpleado = String(r[0] ?? '').trim() !== '' && !Number.isNaN(Number(r[0])) && nombre.length > 2
    if (!esEmpleado) {
      // fin del bloque: fila de totales/resumen tras haber contado gente
      if (personas > 0 && /TOTAL|UOCRA|BANCO|acumulado|Desde Inici/i.test(r.join(' '))) break
      continue
    }
    const monto = parseMonto(r[totalColIdx])
    if (monto > 0) { total += monto; personas++; detalle.push({ nombre, total: monto }) }
  }
  return { desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null, personas, total, detalle }
}
