// P&L DEVENGADO (área Contabilidad y Legales). El dueño (Q10) declaró el Sheet
// "Ingresos y Egresos - P&L" como la FUENTE del P&L devengado. Esta capacidad NO recalcula el P&L:
// LEE el dashboard mensual que el dueño ya arma (pestaña 05_Dashboard_P&L) y lo surfacea al OS.
// Una-capacidad-una-fuente: el cálculo vive en el Sheet, el OS lo referencia. Regla de oro: P&L =
// DEVENGADO; la caja/Cash Flow es percibido y se mira aparte (briefing_caja) — nunca se mezclan.
// 0 API, lectura pura (genera confianza, no escribe nada). Fuente: 05_Dashboard_P&L.

export const PYL_SHEET_ID = '1-NAqlEuKoB0IqCY4res5OiJhbbz_7-F2M-zmpnkpMYg'
export const PYL_TAB = '05_Dashboard_P&L'

const sinAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Parsea un monto es-AR ("$ 50.000.000", "$ -5.368.507", "$ -", "$44.664,00") → número. PURA. */
export function parseMonto(v) {
  if (v == null) return 0
  let s = String(v).trim()
  if (!s || /^\$?\s*-\s*$/.test(s)) return 0 // "$ -" o "-" = cero
  const neg = /-\s*[\d(]/.test(s) || /^\(.*\)$/.test(s)
  s = s.replace(/[^\d,]/g, '') // quita $, espacios y PUNTOS (miles); deja dígitos y coma (decimal)
  if (!s) return 0
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

/** Parsea un porcentaje es-AR ("34,0%", "(20,5%)" = negativo) → número. PURA. */
export function parsePct(v) {
  if (v == null || v === '') return null
  const s = String(v)
  const neg = /^\(.*\)$/.test(s.trim()) || /-\s*\d/.test(s)
  const n = Number(s.replace(/[^\d,]/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

// Fila del dashboard → clave del P&L. El orden importa: las filas "%" van ANTES que su línea base,
// porque el match es por `includes` y "EBITDA %"/"Margen Bruto %" también contienen "ebitda"/"margen
// bruto" — si fueran después, pisarían el monto con el porcentaje.
const MAPEO = [
  ['margen bruto %', 'margen_bruto_pct', true],
  ['ebitda %', 'ebitda_pct', true],
  ['total ingresos', 'ingresos'],
  ['ingresos civil', 'ingresos_civil'],
  ['ingresos mantenimiento', 'ingresos_mantenimiento'],
  ['total costos directos', 'costos_directos'],
  ['margen bruto', 'margen_bruto'],
  ['total gastos operativos', 'gastos_operativos'],
  ['impuesto a los ingresos brutos', 'iibb'],
  ['ebitda', 'ebitda'],
]

function claveDeFila(label) {
  const n = sinAcento(String(label || '')).toLowerCase().trim()
  if (!n) return null
  for (const [txt, key, esPct] of MAPEO) if (n.includes(txt)) return { key, esPct }
  return null
}

/**
 * CORE PURO (testeable sin DB): recibe las filas crudas del dashboard (2D array A1:N22) y arma el
 * P&L mensual + Total 2026. Columnas: 0 = etiqueta, 1..12 = ene..dic, 13 = Total 2026 (fila 4 = header).
 */
export function parsePyL(filas) {
  const header = filas.find((r) => (r || []).some((c) => /ene-\d\d/i.test(String(c || ''))))
  const meses = header ? header.slice(1, 13).map((c) => String(c || '').trim()) : []
  const lineas = {}
  for (const row of filas) {
    const m = claveDeFila(row?.[0])
    if (!m) continue
    if (m.esPct) { lineas[m.key] = { mensual: row.slice(1, 13).map(parsePct), total: parsePct(row[13]) }; continue }
    lineas[m.key] = { mensual: row.slice(1, 13).map(parseMonto), total: parseMonto(row[13]) }
  }
  const total = {}
  for (const k of Object.keys(lineas)) total[k] = lineas[k].total
  return { meses, lineas, total }
}

/** Índice del mes (ene..dic) según texto libre ("julio", "jul", "jul-26"); 'total'/'acumulado' → -1; null si no matchea. */
export function indiceMes(meses, texto) {
  const t = sinAcento(String(texto || '')).toLowerCase().trim()
  if (!t) return null
  if (/total|acumulad|anual|a[nñ]o|2026/.test(t)) return -1
  const pref = t.slice(0, 3)
  for (let i = 0; i < meses.length; i++) if (sinAcento(meses[i]).toLowerCase().startsWith(pref)) return i
  return null
}

/** Arma el P&L de UN período (un mes por índice, o Total 2026 si idx=-1). PURA. */
export function pyLDePeriodo(parsed, idx) {
  const val = (k) => idx === -1 ? parsed.lineas[k]?.total ?? null : parsed.lineas[k]?.mensual?.[idx] ?? null
  return {
    periodo: idx === -1 ? 'Total 2026' : parsed.meses[idx],
    ingresos: val('ingresos'),
    costos_directos: val('costos_directos'),
    margen_bruto: val('margen_bruto'),
    margen_bruto_pct: val('margen_bruto_pct'),
    gastos_operativos: val('gastos_operativos'),
    iibb: val('iibb'),
    ebitda: val('ebitda'),
    ebitda_pct: val('ebitda_pct'),
  }
}

/** Lee el P&L devengado del Sheet. Si se pasa `mes`, devuelve ese período; si no, la serie mensual + YTD. */
export async function estadoPyL(google, mesTexto) {
  if (!google?.readSheetValues) return { error: 'sin cliente de Google para leer el P&L' }
  const filas = await google.readSheetValues(PYL_SHEET_ID, `'${PYL_TAB}'!A1:N24`)
  if (!filas?.length) return { error: `no pude leer la pestaña ${PYL_TAB} del Sheet P&L` }
  const parsed = parsePyL(filas)
  if (!parsed.lineas.ebitda) return { error: 'el dashboard de P&L no tiene el formato esperado (no encontré EBITDA)' }
  const base = { fuente: `Sheet "Ingresos y Egresos - P&L" · ${PYL_TAB}`, criterio: 'DEVENGADO (P&L). La caja es percibido y se ve aparte — no se mezclan.' }
  if (mesTexto) {
    const idx = indiceMes(parsed.meses, mesTexto)
    if (idx == null) return { error: `no reconozco el período "${mesTexto}". Usá un mes (ej. "julio") o "acumulado".`, meses: parsed.meses }
    return { ...pyLDePeriodo(parsed, idx), ...base }
  }
  return { meses: parsed.meses, ytd: pyLDePeriodo(parsed, -1), lineas: parsed.lineas, ...base }
}
