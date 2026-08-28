// DE LA LÁMINA A SUS DIBUJOS, RECORTADOS Y CACHEADOS. El usuario no recorta nada.
//
// ═══ POR QUÉ ESTO EXISTE ═══
//
// `segmentar.mjs` encuentra las regiones y estaba probado… y desconectado, que es la peor de las
// dos mitades: una función que sabe dónde están los dibujos y a la que nadie le pide los recortes.
// Este archivo cierra el circuito LÁMINA → REGIONES → PNG → VISIÓN.
//
// ═══ LA RESOLUCIÓN ES EL PUNTO, NO EL RECORTE ═══
//
// Una lámina A1 mandada entera al modelo llega a ~1.500 px de ancho: en esos píxeles, un símbolo de
// columna de 8 mm en el papel ocupa CUATRO. No se ve, y el modelo no puede contar lo que no ve.
// La misma región recortada y renderizada a 200 dpi le da al mismo símbolo ~60 px. El recorte no es
// una comodidad: es la diferencia entre poder contar y no poder.
//
// El DPI se calcula para que el recorte quede cerca de `LADO_OBJETIVO` px de lado mayor, con un
// tope: una región chica no necesita 600 dpi y una lámina entera no entra a 300.
//
// ═══ CACHÉ POR CONTENIDO ═══
//
// La llave es hash(archivo) + página + caja redondeada + dpi. Reprocesar el mismo proyecto no
// vuelve a rasterizar nada, y una lámina revisada se recorta sola porque cambia su hash.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** El recortador vive al lado de este archivo. Es el único pedazo del circuito que no es Node, y
 *  está ahí porque rasterizar un PDF necesita un motor de render y el de la VM es MuPDF. */
export const RECORTADOR = path.join(AQUI, 'recortar.py')

/** Dónde quedan los PNG. Fuera del repo: son caché, no fuente. */
export const DIR_CACHE = process.env.ORQ_RECORTES_CACHE || path.join(process.env.HOME || '/tmp', '.cache', 'echegaray-recortes')

/** A cuántos píxeles de lado mayor se apunta, y entre qué DPI se puede mover para lograrlo. */
export const LADO_OBJETIVO = 1600
export const DPI_MIN = 96
export const DPI_MAX = 400

/**
 * EL DPI PARA QUE ESTA REGIÓN QUEDE LEGIBLE. PURA.
 *
 * Las cajas del PDF vienen en puntos (1/72"). Para llegar a `LADO_OBJETIVO` píxeles sobre el lado
 * mayor hace falta `objetivo / (lado_en_puntos / 72)` dpi, acotado por los dos extremos: por debajo
 * de DPI_MIN no se lee nada y por encima de DPI_MAX el PNG pesa más de lo que aporta.
 */
export function dpiPara(caja, { ladoObjetivo = LADO_OBJETIVO, min = DPI_MIN, max = DPI_MAX } = {}) {
  const ancho = Math.abs((caja?.[2] ?? 0) - (caja?.[0] ?? 0))
  const alto = Math.abs((caja?.[3] ?? 0) - (caja?.[1] ?? 0))
  const mayorPulgadas = Math.max(ancho, alto) / 72
  if (!(mayorPulgadas > 0)) return min
  return Math.max(min, Math.min(max, Math.round(ladoObjetivo / mayorPulgadas)))
}

/** La llave del recorte. Redondear la caja a 0,1 pt evita que un decimal irrelevante invalide el
 *  caché sin cambiar un solo píxel del resultado. PURA. */
export function llaveDeRecorte(hashArchivo, pagina, caja, dpi) {
  const c = caja.map((v) => Math.round(v * 10) / 10).join('_')
  return `${String(hashArchivo).slice(0, 16)}-p${pagina}-${c}-${dpi}`
}

/**
 * RECORTAR UNA REGIÓN. Devuelve `{ ok, ruta, ancho, alto, dpi, deCache }` o el motivo.
 *
 * No lanza: un recorte que no sale es un dato del cierre —«esta región no se pudo mirar»— y no un
 * error que tumbe el análisis de las otras once regiones de la lámina.
 */
export async function recortar(rutaPdf, { hashArchivo, pagina, caja, dpi = null, dirCache = DIR_CACHE } = {}) {
  const resolucion = dpi ?? dpiPara(caja)
  const llave = llaveDeRecorte(hashArchivo, pagina, caja, resolucion)
  const destino = path.join(dirCache, `${llave}.png`)
  if (fs.existsSync(destino) && fs.statSync(destino).size > 512) {
    return { ok: true, ruta: destino, ...medidaPng(destino), dpi: resolucion, deCache: true, bytes: fs.statSync(destino).size }
  }
  fs.mkdirSync(dirCache, { recursive: true })
  try {
    const { stdout } = await ejecutar('python3', [RECORTADOR, rutaPdf, destino, String(pagina), ...caja.map((v) => String(v)), String(resolucion)], { timeout: 120_000, maxBuffer: 1_000_000 })
    const [ancho, alto] = String(stdout).trim().split('x').map(Number)
    return { ok: true, ruta: destino, ancho, alto, dpi: resolucion, deCache: false, bytes: fs.statSync(destino).size }
  } catch (e) {
    return { ok: false, porQue: `no se pudo recortar la región: ${String(e?.stderr || e?.message || e).slice(0, 160)}`, caja, dpi: resolucion }
  }
}

/**
 * RECORTAR TODAS LAS REGIONES DE UNA LÁMINA. Las que no salen quedan declaradas.
 *
 * `limite` existe porque una lámina mal segmentada puede devolver cuarenta regiones, y mirar cuarenta
 * recortes con visión cuesta cuarenta llamadas. Se recortan las más grandes primero —que son los
 * dibujos, no los sellos— y el resto queda contado y dicho.
 */
export async function recortarRegiones(rutaPdf, regiones = [], { hashArchivo, pagina = 1, limite = 12, dirCache = DIR_CACHE } = {}) {
  const porArea = [...regiones].sort((a, b) => (b.fraccionDeHoja ?? 0) - (a.fraccionDeHoja ?? 0) || a.n - b.n)
  const elegidas = porArea.slice(0, limite)
  const salida = []
  for (const r of elegidas) {
    const rec = await recortar(rutaPdf, { hashArchivo, pagina, caja: r.caja, dirCache })
    salida.push({ region: r, ...rec })
  }
  return {
    recortes: salida,
    logrados: salida.filter((x) => x.ok).length,
    fallidos: salida.filter((x) => !x.ok),
    omitidas: porArea.length - elegidas.length,
    porQueOmitidas: porArea.length > elegidas.length
      ? `${porArea.length - elegidas.length} región(es) quedaron sin recortar por el límite de ${limite}: son las más chicas de la lámina y están declaradas, no perdidas`
      : null,
  }
}

/** El ancho y el alto de un PNG, leídos de su cabecera IHDR. Sin esto, un recorte servido desde el
 *  caché salía sin dimensiones y no se podía saber si tenía resolución suficiente para mirarlo —
 *  que es justamente para lo que existe el recorte. Doce bytes y cero dependencias. */
export function medidaPng(ruta) {
  try {
    const fd = fs.openSync(ruta, 'r')
    const buf = Buffer.alloc(24)
    fs.readSync(fd, buf, 0, 24, 0)
    fs.closeSync(fd)
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return {}
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) }
  } catch { return {} }
}

/** El hash de un archivo, que es la llave de todo el caché de este circuito. */
export const hashDe = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
