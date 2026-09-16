/**
 * contexto.mjs — ENTREGAR SÓLO LO NECESARIO.
 *
 * La medición de `medir-pareto.mjs` sobre 1.151 transcripts reales dice que el 57% del contexto
 * que entra a la ventana lo inyectan dos categorías: leer archivos (41,4%) y buscar (15,7%).
 * Editar código —el trabajo de verdad— es el 1% del contexto y el 8% de las llamadas.
 *
 * Por eso acá NO se lee el archivo: se lee el TRAMO. Primero se localiza con búsqueda textual y
 * git; el archivo entero sólo si es chico. No hay base vectorial: para «dónde está la lista de
 * columnas» un `rg` resuelve en 30 ms lo que un embedding resuelve peor y más caro.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** Corre un comando y devuelve stdout, o '' si falla. Nunca tira: la falta de contexto no es fatal. */
function sh(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) { return e.stdout || '' }
}

/** Busca un patrón en el repo y devuelve [{ruta, linea, texto}]. Textual, no semántico. */
export function buscar(raiz, patron, { globs = [], max = 40 } = {}) {
  const args = ['--line-number', '--no-heading', '--color=never', '-m', String(max)]
  for (const g of globs) args.push('--glob', g)
  args.push(patron, '.')
  const salida = sh('rg', args, raiz)
  return salida.split('\n').filter(Boolean).slice(0, max).map((l) => {
    const m = l.match(/^([^:]+):(\d+):(.*)$/)
    return m ? { ruta: m[1].replace(/^\.\//, ''), linea: Number(m[2]), texto: m[3] } : null
  }).filter(Boolean)
}

/**
 * El TRAMO de un archivo alrededor de una línea, no el archivo.
 * Un archivo de 1.500 líneas cuesta ~36k tokens; un tramo de 60, ~1,4k.
 */
export function tramo(raiz, ruta, { desde = 1, hasta = null, alrededorDe = null, radio = 30 } = {}) {
  const abs = path.join(raiz, ruta)
  const lineas = readFileSync(abs, 'utf8').split('\n')
  let a = desde; let b = hasta ?? lineas.length
  if (alrededorDe != null) { a = Math.max(1, alrededorDe - radio); b = Math.min(lineas.length, alrededorDe + radio) }
  return {
    ruta, desde: a, hasta: b, totalLineas: lineas.length,
    texto: lineas.slice(a - 1, b).map((t, k) => `${a + k}: ${t}`).join('\n'),
  }
}

/** El archivo entero, sólo si es chico. Si no, obliga a pedir un tramo. */
export function archivoSiEsChico(raiz, ruta, { maxBytes = 24_000 } = {}) {
  const abs = path.join(raiz, ruta)
  const n = statSync(abs).size
  if (n > maxBytes) return { ruta, chico: false, bytes: n, texto: null }
  return { ruta, chico: true, bytes: n, texto: readFileSync(abs, 'utf8') }
}

/** Qué se tocó hace poco cerca de este archivo: git es un índice que ya existe y nadie paga. */
export function historia(raiz, ruta, { n = 5 } = {}) {
  return sh('git', ['log', `-${n}`, '--oneline', '--', ruta], raiz).split('\n').filter(Boolean)
}

/** Tests que mencionan este archivo o su símbolo: el contrato que el cambio no puede romper. */
export function testsRelacionados(raiz, ruta) {
  const base = path.basename(ruta).replace(/\.[^.]+$/, '')
  const hits = buscar(raiz, base, { globs: ['*.test.*', '*.spec.*'], max: 15 })
  const rutas = [...new Set(hits.map((h) => h.ruta))]
  return rutas.filter((r) => r !== ruta)
}

/**
 * Arma el paquete mínimo para una tarea y MIDE lo que entrega.
 * `tokensAprox` es el presupuesto real de la tarea: si crece, se nota.
 */
export function contextoMinimo(raiz, { archivos = [], busquedas = [], tramos = [] } = {}) {
  const piezas = []
  for (const b of busquedas) piezas.push({ tipo: 'busqueda', patron: b.patron, hits: buscar(raiz, b.patron, b) })
  for (const t of tramos) piezas.push({ tipo: 'tramo', ...tramo(raiz, t.ruta, t) })
  for (const a of archivos) {
    const r = archivoSiEsChico(raiz, a)
    piezas.push(r.chico ? { tipo: 'archivo', ...r } : { tipo: 'archivo-omitido', ...r, porQue: 'demasiado grande: pedir un tramo' })
  }
  const texto = JSON.stringify(piezas)
  return { piezas, bytes: texto.length, tokensAprox: Math.round(texto.length / 4) }
}
