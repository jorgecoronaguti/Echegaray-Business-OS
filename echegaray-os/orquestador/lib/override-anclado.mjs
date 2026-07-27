// PRESERVAR LAS EDICIONES DEL DUEÑO ANCLADAS AL RÓTULO DE LA FILA — no a su posición (A1).
//
// POR QUÉ (2026-07-27, tras 7 pérdidas). Hasta hoy, cuando un generador regeneraba una pestaña, las
// ediciones del dueño se re-inyectaban por POSICIÓN (celda A1). Pero el generador puede producir la
// misma fila en OTRA posición (agregó/quitó filas arriba, cambió el orden). Al re-inyectar por A1, la
// edición aterrizaba en la fila equivocada → corrupción. Es la causa raíz de que "respetar lo editado"
// fallara una y otra vez.
//
// LA IDEA: anclar cada edición al RÓTULO ESTABLE de su fila (ej. "Estructura", "IVA Compras",
// "Proveedor X"). Cuando el generador regenera y esa fila queda en otra posición, la edición SIGUE a su
// fila por el rótulo, no por el número de fila. Si el rótulo ya no existe (huérfano) o está duplicado
// (ambiguo), NO se aplica a ciegas: se reporta. Preservar de más nunca corrompe; aplicar a la fila
// equivocada sí. Todo PURO y testeable sin tocar ningún Sheet real.

const norm = (v) => String(v ?? '').trim()

/** El ancla estable de una fila = su primer valor no vacío (el rótulo), o la columna `colAncla` si se fija. PURA. */
export function anclaDeFila(fila = [], colAncla = null) {
  if (colAncla != null) return norm(fila[colAncla])
  for (const c of fila) { const s = norm(c); if (s !== '') return s }
  return ''
}

/** Índice de una columna por su encabezado (insensible a mayúsculas/espacios). -1 si no está. PURA. */
export function colDeEncabezado(headers = [], nombre) {
  const n = norm(nombre).toLowerCase()
  return (headers || []).findIndex((h) => norm(h).toLowerCase() === n)
}

/**
 * Extrae las ediciones del dueño como OVERRIDES ANCLADOS, comparando la grilla que dejó el OS (`previo`)
 * con la actual del dueño (`actual`). Cada celda cambiada → {ancla, col, encabezado, valor}. La fila
 * `filaHeaders` se toma como encabezados (para poder anclar la columna por nombre, robusto a reordenar).
 * PURA.
 */
export function overridesDesdeDiff(previo = [], actual = [], { colAncla = null, filaHeaders = 0 } = {}) {
  const headers = actual[filaHeaders] || previo[filaHeaders] || []
  const overrides = []
  const filas = Math.max(previo.length, actual.length)
  for (let r = 0; r < filas; r++) {
    if (r === filaHeaders) continue
    const fp = previo[r] || []
    const fa = actual[r] || []
    const ancla = anclaDeFila(fa.length ? fa : fp, colAncla)
    const cols = Math.max(fp.length, fa.length)
    for (let c = 0; c < cols; c++) {
      if (norm(fp[c]) !== norm(fa[c])) {
        overrides.push({ ancla, col: c, encabezado: norm(headers[c]) || null, valor: fa[c] ?? '' })
      }
    }
  }
  return overrides
}

/**
 * Aplica los overrides del dueño sobre la grilla FRESCA del generador, ANCLANDO por rótulo: cada override
 * busca la fila cuyo ancla coincide y estampa el valor en su columna (por encabezado si lo tiene —robusto
 * a reordenar columnas—, si no por índice). NO muta la entrada.
 *
 * @returns {{grid:any[][], aplicados:object[], huerfanos:object[], ambiguos:object[]}}
 *  - huérfano: el ancla ya no existe en la grilla nueva → NO se aplica (la fila que editaste desapareció).
 *  - ambiguo: el ancla aparece en más de una fila → NO se aplica (no se adivina cuál).
 */
export function aplicarOverrides(gridNuevo = [], overrides = [], { colAncla = null, filaHeaders = 0 } = {}) {
  const grid = (gridNuevo || []).map((f) => (Array.isArray(f) ? [...f] : (f == null ? [] : [f])))
  const headers = grid[filaHeaders] || []
  const filasPorAncla = new Map()
  for (let r = 0; r < grid.length; r++) {
    if (r === filaHeaders) continue
    const a = anclaDeFila(grid[r] || [], colAncla)
    if (a === '') continue
    if (!filasPorAncla.has(a)) filasPorAncla.set(a, [])
    filasPorAncla.get(a).push(r)
  }
  const aplicados = []; const huerfanos = []; const ambiguos = []
  for (const ov of overrides) {
    const filas = filasPorAncla.get(ov.ancla) || []
    if (filas.length === 0) { huerfanos.push(ov); continue }
    if (filas.length > 1) { ambiguos.push(ov); continue }
    const r = filas[0]
    let c = ov.col
    if (ov.encabezado) { const ch = colDeEncabezado(headers, ov.encabezado); if (ch >= 0) c = ch }
    if (!Array.isArray(grid[r])) grid[r] = []
    while (grid[r].length <= c) grid[r].push('')
    grid[r][c] = ov.valor
    aplicados.push({ ...ov, fila: r, col: c })
  }
  return { grid, aplicados, huerfanos, ambiguos }
}
