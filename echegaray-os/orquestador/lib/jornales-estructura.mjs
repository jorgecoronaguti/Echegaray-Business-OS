// PARSER ESTRUCTURAL DE JORNALES — la capa que entiende la planilla como es, sin
// coordenadas pegadas.
//
// POR QUÉ EXISTE. JORNALES es la fuente única de verdad de la asistencia, pero su
// layout NO es estable: bloques de quincena apilados, cada uno con su propio ancho
// de columnas de fecha (se vieron 10, 11, 12, 13 y 16), la fila de rótulos a veces
// dentro del bloque y a veces sólo en la fila 1, filas de totales y un bloque de
// referencia UOCRA cuya columna B parece un nombre de obrero ("Oficial", "Ayudante")
// y no lo es. Cualquier cosa que escriba una celda diaria tiene que DERIVAR la
// coordenada de la planilla leída, nunca asumirla.
//
// Hechos verificados contra el archivo real (30/07/2026, pestaña "Obreros 26"):
//   · 14 bloques; anchos de fecha F..O, F..U, F..Q, F..S, F..R (variable).
//   · las fechas son SERIALES de Google (no texto) → el día de la semana se calcula,
//     no se lee: la fila de letras L/M/X/J/V/S/D tiene errores reales (29/7 rotulado
//     "M" siendo miércoles) y en el primer bloque no existe.
//   · hay celdas diarias con FÓRMULA (`=8+6`, `=4+3*1,5`, `=9+4*1,3`): son horas
//     extra calculadas. Pisarlas destruye el cálculo → se detectan y se bloquean.
//   · hay TEXTO en columnas diarias ("NO SE TOCA HASTA JUL") → no es un valor de horas.
//   · celda vacía NO es 0: en el mismo bloque conviven vacías (no trabajó/no estaba)
//     y ceros explícitos (ausente registrado).
//   · el trabajador aparece en filas DISTINTAS en cada bloque, y el nombre puede
//     traer espacios finales ("Quiroga Sebastian ").
//   · AB = CLIENTE y AC = OBRA son dos columnas distintas, las dos pobladas hoy.
//
// Todo acá es PURO: entra la grilla que devolvió `readSheetGrid`, sale estructura.
// Sin red, sin base, sin fecha del sistema. Por eso se puede testear entero.

/** Fecha en formato D/M o D/M/AA tal como la muestra el Sheet (locale es_AR). */
const RE_FECHA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/

/** Rótulos que cierran un bloque: totales, referencia UOCRA/UOM, acumulados. */
const RE_CIERRE = /\b(UOCRA|UOM|BANCO|TOTAL\s+SEMANA|TOTAL\s+MO|SALDO\s+C|acumulado|Desde\s+Inicio|CAJA)\b/i

/** Nombres que NO son trabajadores aunque estén en la columna de nombre (categorías
 *  del convenio que viven en el bloque de referencia debajo de los totales). */
const RE_NO_TRABAJADOR = /^(oficial|medio\s+oficial|ayudante|operario|obrero|nombre|apellido|categoria|uocra|uom)\b/i

/** Índice de columna (0-based) → letra A1. */
export function letraColumna(i) {
  let s = ''
  let n = Number(i)
  if (!Number.isInteger(n) || n < 0) throw new Error(`letraColumna: índice inválido ${i}`)
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** Rango A1 de UNA celda, con la pestaña citada (los nombres tienen espacios). */
export function celdaA1(pestana, fila1, col0) {
  return `'${String(pestana).replace(/'/g, "''")}'!${letraColumna(col0)}${fila1}`
}

/** Serial de fecha de Google (epoch 1899-12-30) → ISO 'YYYY-MM-DD'.
 *  Se trabaja en UTC a propósito: el serial es un número de días calendario, no un
 *  instante — meterle zona horaria acá es lo que corre las fechas un día. */
export function serialAIso(serial) {
  const n = Number(serial)
  if (!Number.isFinite(n)) return null
  const ms = Math.round(n - 25569) * 86400000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** ISO 'YYYY-MM-DD' → día de la semana 0=domingo … 6=sábado. Calculado, nunca leído
 *  de la fila de letras del Sheet (que tiene errores reales). */
export function diaSemanaIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
}

/** Texto 'D/M' (+ año de contexto) → ISO. Sólo se usa si la celda NO trae serial. */
export function isoDesdeTexto(texto, anioContexto) {
  const m = RE_FECHA.exec(String(texto || '').trim())
  if (!m) return null
  const d = +m[1]
  const mes = +m[2]
  let anio = m[3] ? +m[3] : Number(anioContexto)
  if (!Number.isFinite(anio)) return null
  if (anio < 100) anio += 2000
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Normaliza SÓLO para comparar (obra, cliente, nombre): sin acentos, sin espacios
 * repetidos, sin caracteres invisibles, en mayúsculas. El valor ORIGINAL del Sheet
 * nunca se toca — se guarda aparte y es el que se vuelve a escribir/mostrar.
 */
export function normalizarClave(s) {
  return String(s ?? '')
    .replace(/[​-‍﻿ ]/g, ' ') // invisibles y nbsp
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * Horas desde el contenido de una celda diaria. Acepta coma o punto decimal (el
 * archivo es es_AR: "5,5"). Devuelve null si NO es un número de horas — incluido el
 * caso de texto libre real en columna diaria ("NO SE TOCA HASTA JUL").
 */
export function parseHoras(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v).trim()
  if (t === '') return null
  if (!/^-?\d{1,3}(?:[.,]\d{1,2})?$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** ¿La celda tiene contenido escrito por alguien (valor o fórmula)? Una celda vacía
 *  NO es 0 — esta distinción es la que evita inventar ausencias. */
export function celdaEscrita(c) {
  if (!c) return false
  if (c.formula) return true
  return c.valor != null && String(c.valor).trim() !== ''
}

const celda = (grid, i, j) => (grid.filas?.[i] || [])[j] ?? null
/** Valor recortado — para comparar, medir y matchear rótulos. */
const valor = (c) => (c && c.valor != null ? String(c.valor).trim() : '')
/** Valor CRUDO, tal cual está escrito en el Sheet (incluye espacios al final: existen,
 *  y "Quiroga Sebastian " es lo que el archivo dice). Es el que se muestra y se audita:
 *  normalizar para comparar es correcto; devolver un original alterado, no. */
const crudo = (c) => (c && c.valor != null ? String(c.valor) : '')

/** Busca en una fila la primera columna cuyo rótulo matchea `re`. */
function columnaPorRotulo(grid, fila, re, maxCol = 60) {
  const r = grid.filas?.[fila] || []
  for (let j = 0; j < Math.min(r.length, maxCol); j++) {
    if (re.test(valor(r[j]))) return j
  }
  return null
}

/**
 * Resuelve las columnas de identidad de un bloque (nombre / cliente / obra /
 * categoría), buscando el rótulo primero en la propia fila del bloque (los bloques
 * nuevos lo traen) y si no en la fila 1 de la pestaña (los viejos sólo ahí).
 * Si un rótulo no aparece en ningún lado, la columna queda null y quien la necesite
 * falla con un mensaje claro — nunca se adivina una letra.
 */
export function resolverColumnas(grid, filaBloque, { filaRotulos = 0 } = {}) {
  const buscar = (re) => columnaPorRotulo(grid, filaBloque, re) ?? columnaPorRotulo(grid, filaRotulos, re)
  const cliente = buscar(/^cliente\b/i)
  let obra = buscar(/^obra\b/i)
  // COLISIÓN REAL (bloque de la fila 105 del archivo): ese bloque rotula AB como
  // "Obra" y no tiene columna CLIENTE, así que los dos rótulos caen en la MISMA
  // columna. Una columna es una sola cosa: se expone como asignación (cliente) y
  // `obra` queda en null. Sin esto la obra se mostraba duplicada ("X · X") y la
  // clave de comparación quedaba doble.
  if (obra != null && obra === cliente) obra = null
  return {
    nombre: buscar(/^(obrero|nombre|apellido\s*y\s*nombre)\b/i),
    cliente: cliente ?? buscar(/^obra\b/i),
    obra,
    categoria: buscar(/^categor[ií]a\b/i),
  }
}

/**
 * Detecta los bloques de quincena: filas con ≥`minFechas` celdas de fecha. Devuelve,
 * por bloque, las columnas de fecha con su ISO resuelto (serial si existe, texto si
 * no) y las columnas de identidad ya resueltas por rótulo.
 */
export function detectarBloques(grid, { anio, minFechas = 3, filaRotulos = 0 } = {}) {
  const filas = grid?.filas || []
  const bloques = []
  for (let i = 0; i < filas.length; i++) {
    const fechas = []
    const r = filas[i] || []
    for (let j = 0; j < r.length; j++) {
      const c = r[j]
      const txt = valor(c)
      if (!RE_FECHA.test(txt)) continue
      const iso = typeof c?.numero === 'number' ? serialAIso(c.numero) : isoDesdeTexto(txt, anio)
      if (!iso) continue
      fechas.push({ col: j, texto: txt, iso, dia_semana: diaSemanaIso(iso) })
    }
    if (fechas.length < minFechas) continue
    bloques.push({
      fila: i, // 0-based
      fila1: i + 1, // 1-based (A1)
      fechas,
      col_desde: fechas[0].col,
      col_hasta: fechas[fechas.length - 1].col,
      columnas: resolverColumnas(grid, i, { filaRotulos }),
    })
  }
  return bloques
}

/** ¿Esta fila es la de totales del bloque? Sin nombre y con ≥3 columnas de fecha
 *  ocupadas por fórmulas. Es lo que cierra el bloque sin depender de una fila fija. */
function esFilaTotales(grid, i, bloque, colNombre) {
  if (colNombre != null && valor(celda(grid, i, colNombre)) !== '') return false
  let conFormula = 0
  for (const f of bloque.fechas) if (celda(grid, i, f.col)?.formula) conFormula++
  return conFormula >= 3
}

/**
 * Filas de trabajadores de un bloque, en orden. Corta en la fila de totales o en un
 * rótulo de cierre (UOCRA / BANCO / acumulado…), y SALTA filas intermedias vacías
 * (existen: una fila sin nombre con sólo dos fórmulas de importe antes del total).
 */
export function trabajadoresDeBloque(grid, bloque, { hastaFila } = {}) {
  const cols = bloque.columnas
  if (cols.nombre == null) throw new Error(`jornales: no se pudo resolver la columna de nombre del bloque de la fila ${bloque.fila1}`)
  const filas = grid.filas || []
  const fin = Math.min(hastaFila ?? filas.length, filas.length)
  const out = []
  for (let i = bloque.fila + 1; i < fin; i++) {
    const fila = filas[i] || []
    const texto = fila.map((c) => valor(c)).join(' ')
    if (esFilaTotales(grid, i, bloque, cols.nombre)) break
    if (RE_CIERRE.test(texto)) break
    const nombre = valor(celda(grid, i, cols.nombre))
    if (nombre.length <= 2) continue
    if (RE_NO_TRABAJADOR.test(nombre)) continue
    const clienteOrig = cols.cliente == null ? '' : crudo(celda(grid, i, cols.cliente))
    const obraOrig = cols.obra == null ? '' : crudo(celda(grid, i, cols.obra))
    out.push({
      fila: i,
      fila1: i + 1,
      nombre_original: crudo(celda(grid, i, cols.nombre)),
      nombre_clave: normalizarClave(nombre),
      cliente_original: clienteOrig,
      cliente_clave: normalizarClave(clienteOrig),
      obra_original: obraOrig,
      obra_clave: normalizarClave(obraOrig),
      categoria: cols.categoria == null ? null : valor(celda(grid, i, cols.categoria)) || null,
    })
  }
  return out
}

/** El bloque que contiene una fecha ISO. null si esa fecha todavía no existe en la
 *  planilla — caso real y esperado: nunca se crea una columna nueva. */
export function bloquePorFecha(bloques, iso) {
  for (const b of bloques) if (b.fechas.some((f) => f.iso === iso)) return b
  return null
}

/** La columna de una fecha dentro de un bloque. Si la fecha estuviera repetida en el
 *  mismo bloque, es ambigüedad estructural y se declara: no se elige una. */
export function columnaDeFecha(bloque, iso) {
  const hits = bloque.fechas.filter((f) => f.iso === iso)
  if (hits.length === 0) return { ok: false, motivo: 'fecha_no_en_bloque' }
  if (hits.length > 1) return { ok: false, motivo: 'fecha_ambigua', columnas: hits.map((h) => h.col) }
  return { ok: true, ...hits[0] }
}

/**
 * Obras (cliente + obra) presentes en un bloque, deduplicadas por clave normalizada
 * y conservando el texto original de la primera aparición. No inventa, no ordena por
 * criterio oculto: orden de aparición, que es el que el jefe de obra reconoce.
 */
export function obrasDeBloque(grid, bloque) {
  const vistas = new Map()
  for (const t of trabajadoresDeBloque(grid, bloque)) {
    const clave = `${t.cliente_clave}|${t.obra_clave}`
    if (clave === '|') continue // fila sin cliente ni obra: no es una opción elegible
    if (!vistas.has(clave)) {
      vistas.set(clave, {
        clave,
        cliente_original: t.cliente_original,
        cliente_clave: t.cliente_clave,
        obra_original: t.obra_original,
        obra_clave: t.obra_clave,
        etiqueta: [t.cliente_original, t.obra_original].filter(Boolean).join(' · '),
        personas: 0,
      })
    }
    vistas.get(clave).personas++
  }
  return [...vistas.values()]
}

/** Trabajadores de una obra concreta dentro de un bloque (match por clave normalizada). */
export function personalDeObra(grid, bloque, claveObra) {
  return trabajadoresDeBloque(grid, bloque).filter((t) => `${t.cliente_clave}|${t.obra_clave}` === claveObra)
}

/**
 * Lee el estado ACTUAL de la celda diaria de un trabajador: si está escrita, si tiene
 * fórmula (no se toca) y qué horas representa. Es lo que se compara antes y después
 * para detectar concurrencia y sobrescritura.
 */
export function leerCeldaDiaria(grid, filaTrabajador, col) {
  const c = celda(grid, filaTrabajador, col)
  const escrita = celdaEscrita(c)
  return {
    escrita,
    formula: c?.formula ?? null,
    valor_crudo: c?.valor ?? null,
    horas: parseHoras(typeof c?.numero === 'number' ? c.numero : c?.valor),
    // Texto que NO es número de horas y no es fórmula: hay algo escrito que no
    // entendemos. Nunca se pisa a ciegas.
    texto_no_numerico: escrita && !c?.formula && parseHoras(c?.valor) === null,
  }
}
