// EL CACHÉ DIRECCIONADO POR CONTENIDO — la pieza que hace que saber más no cueste más.
//
// ═══ EL PROBLEMA QUE RESUELVE ═══
//
// Una biblioteca técnica que crece hace que cada cotización sea más lenta si en cada corrida hay
// que volver a bajar, volver a parsear y volver a preguntar. La defensa es una sola y es vieja:
// la RESPUESTA se guarda bajo el hash de su ENTRADA. Si la entrada no cambió, no se reprocesa.
//
// La clave incluye la VERSIÓN del productor. Cambiar el parser sin cambiar la versión sirve una
// respuesta vieja con código nuevo, que es la peor forma de fallar: sin error y sin aviso.
//
// ═══ POR QUÉ NO GUARDA `null` ═══
//
// Un fallo de red guardado es un fallo de red permanente. Sólo se cachea lo que el productor
// declara logrado; lo que falló se vuelve a intentar la próxima vez.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const DIR_CACHE = process.env.ORQ_CONOCIMIENTO_CACHE
  || path.join(process.env.HOME || '/tmp', '.cache', 'echegaray-conocimiento')

/** El hash de cualquier entrada serializable. Las claves de los objetos se ordenan: dos entradas
 *  iguales escritas en distinto orden tienen que dar el MISMO hash. PURA. */
export function huella(entrada) {
  const estable = (x) => {
    if (x === null || typeof x !== 'object') return x
    if (Array.isArray(x)) return x.map(estable)
    return Object.fromEntries(Object.keys(x).sort().map((k) => [k, estable(x[k])]))
  }
  return crypto.createHash('sha256').update(JSON.stringify(estable(entrada) ?? null)).digest('hex')
}

/** La clave de caché de una entrada, bajo un espacio de nombres y una versión del productor. PURA. */
export const claveDe = (espacio, version, entrada) => `${espacio}:v${version}:${huella(entrada).slice(0, 32)}`

/** El contador de una corrida. No es global: se crea uno por ejecución y viaja con ella, para que
 *  dos corridas simultáneas no se mezclen las estadísticas. */
export function contador() {
  const c = { hits: 0, misses: 0, escrituras: 0, errores: 0 }
  return {
    ...c,
    hit() { c.hits += 1 },
    miss() { c.misses += 1 },
    escribio() { c.escrituras += 1 },
    error() { c.errores += 1 },
    /** La tasa de acierto. `null` —no 0— cuando todavía no se consultó nada: 0 sería una medición
     *  y no lo es. */
    tasa() { const t = c.hits + c.misses; return t === 0 ? null : c.hits / t },
    resumen() { return { hits: c.hits, misses: c.misses, escrituras: c.escrituras, errores: c.errores, tasa: c.hits + c.misses === 0 ? null : Math.round((c.hits / (c.hits + c.misses)) * 1000) / 1000 } },
  }
}

const rutaDe = (dir, clave) => path.join(dir, `${clave.replace(/[^A-Za-z0-9:._-]/g, '_')}.json`)

/** Lee una entrada del caché. Devuelve `undefined` cuando no está — nunca `null`, que es un valor
 *  legítimo que alguien pudo haber guardado. */
export function leer(clave, { dir = DIR_CACHE } = {}) {
  try { return JSON.parse(fs.readFileSync(rutaDe(dir, clave), 'utf8')).valor } catch { return undefined }
}

/** Escribe una entrada. Devuelve `true` si quedó escrita. */
export function escribir(clave, valor, { dir = DIR_CACHE } = {}) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(rutaDe(dir, clave), JSON.stringify({ clave, valor, guardado: new Date().toISOString() }))
    return true
  } catch { return false }
}

/**
 * CORRER ALGO CON CACHÉ. La única puerta: nadie llama a `leer`/`escribir` por su cuenta.
 *
 * `producir` devuelve `{ ok, valor }`. Sólo se guarda lo que trae `ok: true`; un error de red o un
 * documento que no se pudo abrir se reintenta la próxima corrida en vez de fosilizarse.
 */
export async function conCache({ espacio, version, entrada, producir, stats = null, dir = DIR_CACHE, refrescar = false }) {
  const clave = claveDe(espacio, version, entrada)
  if (!refrescar) {
    const guardado = leer(clave, { dir })
    if (guardado !== undefined) { stats?.hit(); return { valor: guardado, deCache: true, clave } }
  }
  stats?.miss()
  const r = await producir()
  if (r?.ok) { if (escribir(clave, r.valor, { dir })) stats?.escribio() } else { stats?.error() }
  return { valor: r?.valor, deCache: false, clave, ok: Boolean(r?.ok), porQue: r?.porQue ?? null }
}
