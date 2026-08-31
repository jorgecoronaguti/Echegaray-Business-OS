// BUSCAR · FILTRAR · ORDENAR · ACTUALIZAR UNA TABLA. NÚCLEO PURO, cero I/O.
//
// ═══ POR QUÉ ESTAS CUATRO NO NECESITAN UN MODELO ═══
//
// "Buscá el proveedor X", "ordená por fecha", "actualizá la fila de la factura 0001-00012345" son
// operaciones de tabla, no de lenguaje. Que hoy pasen por un modelo tiene una única causa: la
// tabla llega como un rectángulo de celdas sin nombre, y alguien tiene que decidir cuál columna es
// "fecha". Ese es el único paso interpretativo, y se resuelve UNA vez —al leer el encabezado—, no
// en cada operación.
//
// ═══ LAS DOS REGLAS QUE VIENEN DE HABER PERDIDO PLATA ═══
//
// 1. SE MAPEA POR ENCABEZADO, NO POR POSICIÓN. Cuando alguien inserta una columna, la columna 4 ya
//    no es la misma columna 4. Un upsert por posición escribe importes en la columna de fechas sin
//    dar un solo error.
//
// 2. LA CLAVE SE RECORTA DE LOS DOS LADOS, SIEMPRE. Este repo tiene la cicatriz: una clave
//    recortada en JS y cruda en el COUNTIFS del Sheet hizo que una suma diera 3,58 veces de menos.
//    `normalizarClave` es una sola función y la usan la búsqueda, el filtro y el upsert — si hubiera
//    dos formas de normalizar, volvería a haber dos verdades.

import { TIPOS, parsearFechaEsAr, tipoDe } from './tipos.mjs'
import { normalizar } from './verificacion.mjs'

/**
 * LA CLAVE, NORMALIZADA. Una sola definición para todo el motor.
 *
 * Recorta, colapsa espacios internos, saca acentos y pasa a minúsculas. "  ACME  S.A. " y
 * "acme s.a." son el mismo proveedor; tratarlos como dos es cómo un mismo proveedor aparece dos
 * veces en un cuadro y su total sale al doble.
 */
export function normalizarClave(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Un rectángulo de celdas → tabla con nombres.
 *
 * @param {any[][]} grid incluye la fila de encabezado
 * @param {{filaEncabezado?:number}} [opciones]
 * @returns {{encabezado:string[], indice:Map<string,number>, filas:any[][], offsetDatos:number}}
 *          `offsetDatos` es cuántas filas del `grid` quedaron arriba de los datos — hace falta para
 *          traducir un índice de fila de vuelta a su dirección real en la hoja.
 */
export function leerTabla(grid, { filaEncabezado = 0 } = {}) {
  const encabezado = (grid?.[filaEncabezado] ?? []).map((h) => String(h ?? '').trim())
  const indice = new Map()
  encabezado.forEach((h, i) => { if (h && !indice.has(normalizarClave(h))) indice.set(normalizarClave(h), i) })
  return {
    encabezado,
    indice,
    filas: (grid ?? []).slice(filaEncabezado + 1),
    offsetDatos: filaEncabezado + 1,
  }
}

/** El índice de una columna por su nombre de encabezado. `-1` si no está. */
export function columna(tabla, nombre) {
  const i = tabla.indice.get(normalizarClave(nombre))
  return i === undefined ? -1 : i
}

/**
 * BUSCAR: las filas donde la columna `campo` coincide con `valor`.
 *
 * `exacto` compara por clave normalizada (el caso de "traeme la fila de esta factura"); si no,
 * compara por contención, que es lo que se quiere al buscar "estrella" y encontrar
 * "LA ESTRELLA /ALIMENTOS DEL SUR SAS".
 *
 * Devuelve `{ fila, indice, valor }` y no sólo la fila: sin el índice no se puede volver a escribir
 * en el lugar de donde salió, que es la mitad del uso real de una búsqueda.
 */
export function buscar(tabla, campo, valor, { exacto = true } = {}) {
  const c = columna(tabla, campo)
  if (c < 0) return { columna: -1, resultados: [] }
  const q = normalizarClave(valor)
  const resultados = []
  tabla.filas.forEach((fila, i) => {
    const v = normalizarClave(fila?.[c])
    const hit = exacto ? v === q : v.includes(q)
    if (hit) resultados.push({ indice: i, fila, valor: fila?.[c] ?? null })
  })
  return { columna: c, resultados }
}

/**
 * FILTRAR: las filas que cumplen TODAS las condiciones.
 *
 * Cada condición es `{ campo, op, valor }`. Los operadores son deliberadamente pocos y todos
 * decidibles sin interpretar nada: `=`, `!=`, `>`, `>=`, `<`, `<=`, `contiene`, `vacio`, `no_vacio`.
 * Un operador que necesitara entender la intención ("parecido a") es justamente lo que este motor
 * no hace.
 */
export function filtrar(tabla, condiciones = []) {
  const resueltas = condiciones.map((cond) => ({ ...cond, c: columna(tabla, cond.campo) }))
  const faltantes = resueltas.filter((r) => r.c < 0).map((r) => r.campo)
  const resultados = []
  tabla.filas.forEach((fila, i) => {
    if (resueltas.every((r) => r.c >= 0 && cumple(fila?.[r.c], r.op, r.valor))) {
      resultados.push({ indice: i, fila })
    }
  })
  return { resultados, columnasFaltantes: faltantes }
}

/** ¿Esta celda cumple la condición? Los números se comparan como números, todo lo demás como texto
 *  normalizado — comparar "10" con "9" como texto daría que 10 es menor que 9. */
function cumple(celda, op, valor) {
  const a = normalizar(celda)
  const b = normalizar(valor)
  const numerico = a.tipo === TIPOS.NUMERO && b.tipo === TIPOS.NUMERO
  switch (op) {
    case 'vacio': return a.tipo === TIPOS.VACIO
    case 'no_vacio': return a.tipo !== TIPOS.VACIO
    case '=': return numerico ? a.n === b.n : normalizarClave(a.s) === normalizarClave(b.s)
    case '!=': return numerico ? a.n !== b.n : normalizarClave(a.s) !== normalizarClave(b.s)
    case '>': return numerico ? a.n > b.n : normalizarClave(a.s) > normalizarClave(b.s)
    case '>=': return numerico ? a.n >= b.n : normalizarClave(a.s) >= normalizarClave(b.s)
    case '<': return numerico ? a.n < b.n : normalizarClave(a.s) < normalizarClave(b.s)
    case '<=': return numerico ? a.n <= b.n : normalizarClave(a.s) <= normalizarClave(b.s)
    case 'contiene': return normalizarClave(a.s).includes(normalizarClave(b.s))
    default: return false
  }
}

/** El valor por el que se ordena una celda: número, fecha (como serial) o texto normalizado.
 *  Sin esto, "10/01/2026" ordena antes que "9/01/2026" porque "1" < "9" en texto. */
function claveDeOrden(celda) {
  const t = tipoDe(celda)
  if (t === TIPOS.FECHA) return { n: parsearFechaEsAr(celda).getTime(), s: null }
  const n = normalizar(celda)
  if (n.tipo === TIPOS.NUMERO) return { n: n.n, s: null }
  if (n.tipo === TIPOS.VACIO) return { n: null, s: null }
  return { n: null, s: normalizarClave(n.s) }
}

/**
 * ORDENAR: devuelve las filas ordenadas, sin mutar la tabla.
 *
 * LAS VACÍAS VAN SIEMPRE AL FINAL, en ascendente y en descendente. Es lo que hace Sheets y lo que
 * la gente espera: una fila sin fecha arriba de todo en un cuadro cronológico parece un dato del
 * año cero. `estable: true` porque el orden de llegada es información y se conserva ante empates.
 *
 * @param {{campo:string, desc?:boolean}[]} criterios en orden de prioridad
 */
export function ordenar(tabla, criterios = []) {
  const cols = criterios.map((k) => ({ ...k, c: columna(tabla, k.campo) }))
  const faltantes = cols.filter((k) => k.c < 0).map((k) => k.campo)
  const conIndice = tabla.filas.map((fila, i) => ({ fila, i }))
  conIndice.sort((x, y) => {
    for (const k of cols) {
      if (k.c < 0) continue
      const a = claveDeOrden(x.fila?.[k.c])
      const b = claveDeOrden(y.fila?.[k.c])
      const aVacia = a.n === null && a.s === null
      const bVacia = b.n === null && b.s === null
      if (aVacia !== bVacia) return aVacia ? 1 : -1 // las vacías al fondo, siempre
      if (aVacia) continue
      let cmp = 0
      if (a.n !== null && b.n !== null) cmp = a.n - b.n
      else cmp = String(a.s ?? a.n).localeCompare(String(b.s ?? b.n), 'es')
      if (cmp) return k.desc ? -cmp : cmp
    }
    return x.i - y.i // estable
  })
  return { filas: conIndice.map((r) => r.fila), orden: conIndice.map((r) => r.i), columnasFaltantes: faltantes }
}

/**
 * ACTUALIZAR TABLA — el plan de un upsert por clave de negocio. PURO: no escribe, propone.
 *
 * Devuelve `{ ediciones, altas, conflictos }`:
 *   · `ediciones` — celdas sueltas a cambiar en filas que ya existen, con su `{indice, col, de, a}`.
 *   · `altas`     — filas nuevas, ya alineadas al ancho del encabezado.
 *   · `conflictos`— claves que aparecen más de una vez en el destino. NO se elige una: elegir cuál
 *                   de dos filas duplicadas es "la buena" es una decisión de negocio, y adivinarla
 *                   es cómo se pisa la fila correcta.
 *
 * SE TOCA SÓLO LA CELDA QUE CAMBIA, no la fila entera. Escribir la fila completa pisaría las
 * columnas que el registro entrante no trae —las anotaciones de la persona, las fórmulas de la
 * planilla— con vacíos, que es la Regla 0 al revés.
 *
 * @param {object} tabla la de `leerTabla`
 * @param {string} campoClave nombre de la columna que identifica un registro
 * @param {Record<string, unknown>[]} registros entradas nuevas, con nombres de columna
 */
export function planUpsert(tabla, campoClave, registros = []) {
  const cClave = columna(tabla, campoClave)
  if (cClave < 0) return { ediciones: [], altas: [], conflictos: [], columnaClaveFaltante: campoClave }

  const porClave = new Map()
  const conflictos = []
  tabla.filas.forEach((fila, i) => {
    const k = normalizarClave(fila?.[cClave])
    if (!k) return
    if (porClave.has(k)) { conflictos.push({ clave: k, indices: [porClave.get(k), i] }); return }
    porClave.set(k, i)
  })

  const ediciones = []
  const altas = []
  const ignoradas = new Set()
  for (const reg of registros) {
    const k = normalizarClave(reg?.[campoClave])
    if (!k) continue
    const i = porClave.get(k)
    if (i === undefined) { altas.push(filaDesdeRegistro(tabla, reg, ignoradas)); continue }
    for (const [campo, valor] of Object.entries(reg)) {
      const c = columna(tabla, campo)
      if (c < 0) { ignoradas.add(campo); continue }
      const actual = tabla.filas[i]?.[c]
      if (mismaCelda(actual, valor)) continue
      ediciones.push({ indice: i, col: c, campo, de: actual ?? null, a: valor })
    }
  }
  return { ediciones, altas, conflictos, camposIgnorados: [...ignoradas] }
}

/** Un registro con nombres → una fila alineada al encabezado. Lo que el encabezado no tiene se
 *  anota como ignorado en vez de agregarse al final: una columna nueva es una decisión, no un
 *  efecto colateral de un import. */
function filaDesdeRegistro(tabla, reg, ignoradas) {
  const fila = Array.from({ length: tabla.encabezado.length }, () => '')
  for (const [campo, valor] of Object.entries(reg)) {
    const c = columna(tabla, campo)
    if (c < 0) { ignoradas.add(campo); continue }
    fila[c] = valor
  }
  return fila
}

/** Igualdad de celda para decidir si vale la pena escribir. Usa la misma normalización que la
 *  verificación: si no, se generarían ediciones que reescriben "1234,5" sobre "1.234,50". */
function mismaCelda(a, b) {
  const x = normalizar(a)
  const y = normalizar(b)
  if (x.tipo === TIPOS.NUMERO && y.tipo === TIPOS.NUMERO) return x.n === y.n
  return x.tipo === y.tipo && x.s === y.s
}
