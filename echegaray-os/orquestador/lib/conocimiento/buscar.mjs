// BÚSQUEDA WEB SIN MODELO — el buscador que sigue andando cuando Claude no está.
//
// ═══ POR QUÉ EXISTE, SI YA HABÍA UNO ═══
//
// `orquestador/lib/web-search.mjs` busca en internet a través de la herramienta server-side del
// proveedor: es una llamada al modelo. Cuando no hay saldo, no hay API key o el proveedor está
// caído, ese buscador NO BUSCA. Y buscar no es razonar: es una petición HTTP y un parser.
//
// Este módulo hace la petición y el parseo con la biblioteca estándar. Cero API keys, cero costo,
// cero dependencia de un proveedor de razonamiento. Lo que un modelo agrega —leer diez páginas y
// resumirlas— sigue siendo del modelo; encontrar dónde mirar, no.
//
// ═══ LO QUE NO CAMBIA ═══
//
// Nada de acá asciende a HECHO. Un resultado de búsqueda es una PISTA: un título, una URL y un
// fragmento que el buscador eligió. La lectura pasa por `web/web-lectura.mjs` (que ya defiende
// contra SSRF, tamaño y tipo) y por `web/contenido-externo.mjs` (que sella el bloque y marca los
// intentos de inyección). Este archivo no reimplementa ninguna de esas dos defensas.
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { conCache, contador, huella } from './cache.mjs'
import { leerUrl, urlPermitida } from '../web/web-lectura.mjs'
import { ORIGEN_EXTERNO, aplicarPoliticaContenidoExterno, envolverContenidoExterno } from '../web/contenido-externo.mjs'

const correr = promisify(execFile)

/** El extractor vive en su propio archivo: un guion embebido en un string se rompe callado con el
 *  escapado y devuelve texto vacío en vez de un error. */
const GUION_PDF = path.join(path.dirname(new URL(import.meta.url).pathname), 'leer-pdf.py')

/** Sube cuando cambia el parser o la forma del resultado: si no sube, el caché sirve respuestas
 *  viejas con código nuevo, que es la peor forma de fallar — sin error y sin aviso. */
export const VERSION_BUSCADOR = 1

export const MOTOR = Object.freeze({
  DUCKDUCKGO_HTML: { id: 'duckduckgo-html', url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, nombre: 'DuckDuckGo (HTML)' },
  DUCKDUCKGO_LITE: { id: 'duckduckgo-lite', url: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, nombre: 'DuckDuckGo (lite)' },
})

const AGENTE = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
export const TIMEOUT_MS = 20_000

/** Un reglamento entero pesa. Estos topes existen para que una fuente enorme no se lleve la corrida
 *  ni la memoria: se lee lo que entra y se DECLARA que se truncó, que es distinto de leerlo todo. */
export const PDF_MAX_BYTES = 40_000_000
export const PDF_MAX_PAGINAS = 60
export const PDF_MAX_CARACTERES = 120_000

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'", nbsp: ' ' }
const desescapar = (s) => String(s).replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (_, e) => ENTIDADES[e] ?? ' ')
const sinEtiquetas = (s) => desescapar(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/**
 * LA URL REAL DETRÁS DE LA DEL BUSCADOR. PURA.
 *
 * DuckDuckGo envuelve cada resultado en un redirector propio (`/l/?uddg=…`). Guardar esa envoltura
 * sería guardar un link que caduca y que no dice de qué dominio salió el dato: sin el dominio no
 * hay autoridad que evaluar, y sin autoridad este buscador no sirve para nada técnico.
 */
export function urlReal(href) {
  const s = String(href ?? '')
  const m = s.match(/[?&]uddg=([^&]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { return null } }
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return `https:${s}`
  return null
}

/**
 * PARSEAR LA PÁGINA DE RESULTADOS. PURA — y por eso se puede probar sin red.
 *
 * Devuelve `{ titulo, url, fragmento, posicion }`. Un resultado sin URL utilizable se descarta:
 * un título sin dónde verificarlo no es una fuente.
 */
export function parsearResultados(html, { max = 10 } = {}) {
  const texto = String(html ?? '')
  const salida = []
  const vistos = new Set()
  // La página HTML usa `result__a`; la `lite` usa una tabla con `result-link`. Un solo recorrido
  // sirve a las dos porque lo que se busca es el ancla, no la envoltura.
  const re = /<a[^>]+class="[^"]*(?:result__a|result-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(texto)) !== null && salida.length < max) {
    const url = urlReal(m[1])
    const titulo = sinEtiquetas(m[2])
    if (!url || !titulo || vistos.has(url)) continue
    vistos.add(url)
    salida.push({ posicion: salida.length + 1, titulo, url, fragmento: null })
  }
  // Los fragmentos van en su propio nodo y en el mismo orden que las anclas.
  const frags = [...texto.matchAll(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((f) => sinEtiquetas(f[1] ?? f[2] ?? ''))
  salida.forEach((r, i) => { r.fragmento = frags[i] ?? null })
  return salida
}

/**
 * BUSCAR. Sin modelo, sin API key, con caché por hash de la consulta.
 *
 * Devuelve SIEMPRE la misma forma, incluso cuando falla: `{ ok, resultados, motor, porQue }`. Un
 * buscador que tira una excepción obliga a envolverlo en un try/catch en cada llamador, y ahí es
 * donde se pierde el motivo del fallo.
 */
export async function buscar(consulta, {
  motor = MOTOR.DUCKDUCKGO_HTML, max = 10, fetchImpl = fetch, stats = null, refrescar = false, timeoutMs = TIMEOUT_MS, dir = undefined,
} = {}) {
  const q = String(consulta ?? '').trim()
  if (!q) return { ok: false, resultados: [], motor: motor.id, porQue: 'la consulta está vacía', sinModelo: true }
  const { valor, deCache, ok, porQue } = await conCache({
    espacio: `buscar:${motor.id}`, version: VERSION_BUSCADOR, entrada: { q, max }, stats, refrescar,
    ...(dir === undefined ? {} : { dir }),
    producir: async () => {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(motor.url(q), { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': AGENTE, Accept: 'text/html' } })
        if (!res?.ok) return { ok: false, valor: { resultados: [], porQue: `el buscador respondió ${res?.status ?? '(sin status)'}` } }
        const html = await res.text()
        const resultados = parsearResultados(html, { max })
        // Cero resultados NO se cachea: puede ser un bloqueo temporal del buscador, y guardarlo
        // deja a XSAS convencido de que sobre ese tema no hay nada escrito en internet.
        if (!resultados.length) return { ok: false, valor: { resultados: [], porQue: 'el buscador no devolvió resultados interpretables' } }
        return { ok: true, valor: { resultados, consultadoEn: new Date().toISOString() } }
      } catch (e) {
        return { ok: false, valor: { resultados: [], porQue: `no pude consultar el buscador: ${String(e?.message ?? e).slice(0, 140)}` } }
      } finally { clearTimeout(t) }
    },
  })
  return {
    ok: deCache ? true : Boolean(ok),
    resultados: valor?.resultados ?? [],
    consultadoEn: valor?.consultadoEn ?? null,
    motor: motor.id, deCache, sinModelo: true,
    porQue: valor?.porQue ?? porQue ?? null,
  }
}

/**
 * TRAER UNA PÁGINA Y DEJARLA LISTA PARA CITAR. Sin modelo.
 *
 * Reusa entera la lectura defendida del OS —`leerUrl` ya aplica la política de contenido externo,
 * sella el bloque, marca los intentos de inyección y deja el resultado marcado como
 * REFERENCIA_EXTERNA— y le agrega lo único que faltaba para uso técnico: el HASH del contenido.
 * Ese hash es lo que después permite decir «esta fuente cambió» y lo que hace que la biblioteca no
 * vuelva a estudiar lo que ya estudió.
 */
export async function traer(url, { fetchImpl = fetch, stats = null, refrescar = false, consulta = null, dir = undefined } = {}) {
  const { valor, deCache, ok, porQue } = await conCache({
    espacio: 'traer', version: VERSION_BUSCADOR, entrada: { url: String(url) }, stats, refrescar,
    ...(dir === undefined ? {} : { dir }),
    producir: async () => {
      const r = await leerUrl(url, { fetchImpl, consulta })
      if (r?.error) return { ok: false, valor: { porQue: r.error } }
      // Una página que se abrió pero no dejó texto NO es una lectura lograda: cachearla convence a
      // XSAS de que esa fuente está vacía. Se declara el porqué y se vuelve a intentar.
      const caracteres = r?.evidencia?.caracteres ?? 0
      if (!caracteres) return { ok: false, valor: { porQue: `${url} se abrió pero no dejó texto legible (0 caracteres)` } }
      return { ok: true, valor: { ...r, caracteres, hash: huella(r.contenido_externo ?? ''), traidoEn: new Date().toISOString() } }
    },
  })
  if (!valor || (!deCache && !ok)) {
    return { ok: false, url: String(url), caracteres: 0, porQue: valor?.porQue ?? porQue ?? 'no se pudo leer', sinModelo: true }
  }
  return { ok: true, ...valor, url: valor.url ?? String(url), deCache, sinModelo: true }
}

export { contador, envolverContenidoExterno }

/**
 * TRAER UN PDF Y SACARLE EL TEXTO. Sin modelo, sin OCR, sin servicio externo.
 *
 * ═══ POR QUÉ HACÍA FALTA ═══
 *
 * Medido: buscando «CIRSOC 201 2025 vigencia», las DOS fuentes con autoridad de organismo técnico
 * que devolvió el buscador eran PDF, y `leerUrl` las rechaza («no sé leer ese tipo de contenido»).
 * Sin esto, el motor de investigación sólo podía leer blogs — justo lo que menos vale. Los
 * reglamentos, las normas y las fichas de fabricante son PDF casi siempre.
 *
 * Usa PyMuPDF, que ya está en la VM. Si no estuviera, devuelve el motivo en vez de tirar: una
 * dependencia ausente es un dato, no una excepción.
 *
 * ═══ LO QUE NO AFLOJA ═══
 *
 * La misma guarda de destino que el resto (`urlPermitida`: nada de red interna, nada de credenciales
 * embebidas, sólo http/https, y se revalida el destino FINAL del redirect), los mismos topes, y el
 * texto sale por `aplicarPoliticaContenidoExterno` — REFERENCIA_EXTERNA, sellado y con los intentos
 * de inyección marcados. Un PDF con instrucciones adentro es contenido, no una orden.
 *
 * ═══ EL HASH ES DEL ARCHIVO ═══
 *
 * No del texto extraído: es lo que contesta «¿cambió el reglamento?» aunque el extractor cambie.
 */
export async function traerPdf(url, { fetchImpl = fetch, stats = null, refrescar = false, consulta = null, dir = undefined, maxPaginas = PDF_MAX_PAGINAS } = {}) {
  const { valor, deCache, ok, porQue } = await conCache({
    espacio: 'traer-pdf', version: VERSION_BUSCADOR, entrada: { url: String(url), maxPaginas }, stats, refrescar,
    ...(dir === undefined ? {} : { dir }),
    producir: async () => {
      const guarda = urlPermitida(url)
      if (!guarda.ok) return { ok: false, valor: { porQue: `no puedo bajar esa dirección: ${guarda.motivo}` } }
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS * 3)
      let tmp = null
      try {
        const res = await fetchImpl(guarda.url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': AGENTE, Accept: 'application/pdf' } })
        if (!res?.ok) return { ok: false, valor: { porQue: `${guarda.url} respondió ${res?.status ?? '(sin status)'}` } }
        const finalUrl = res.url || guarda.url
        const guardaFinal = urlPermitida(finalUrl)
        if (!guardaFinal.ok) return { ok: false, valor: { porQue: `redirigió a un destino no permitido: ${guardaFinal.motivo}` } }
        const bytes = Buffer.from(await res.arrayBuffer())
        if (!bytes.subarray(0, 5).toString('latin1').startsWith('%PDF')) return { ok: false, valor: { porQue: 'lo que llegó no empieza con %PDF: no es un PDF' } }
        if (bytes.length > PDF_MAX_BYTES) return { ok: false, valor: { porQue: `el PDF pesa ${bytes.length} bytes, más de los ${PDF_MAX_BYTES} que se leen por esta vía` } }
        tmp = path.join(os.tmpdir(), `conocimiento-${huella({ u: finalUrl }).slice(0, 20)}.pdf`)
        fs.writeFileSync(tmp, bytes)
        const { stdout } = await correr('python3', [GUION_PDF, tmp, String(maxPaginas)], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 })
        const salida = JSON.parse(stdout)
        if (salida.error) return { ok: false, valor: { porQue: salida.error } }
        const texto = String(salida.texto ?? '')
        if (!texto.trim()) return { ok: false, valor: { porQue: `el PDF se abrió (${salida.paginas} páginas) pero no tiene capa de texto: haría falta OCR` } }
        const truncado = texto.length > PDF_MAX_CARACTERES || salida.leidas < salida.paginas
        const envuelto = aplicarPoliticaContenidoExterno({
          texto: texto.slice(0, PDF_MAX_CARACTERES), origen: ORIGEN_EXTERNO.WEB, url: finalUrl,
          titulo: (() => { try { return path.basename(new URL(finalUrl).pathname) || null } catch { return null } })(),
          consulta,
        })
        return {
          ok: true,
          valor: {
            ...envuelto,
            formato: 'pdf', paginas: salida.paginas, paginasLeidas: salida.leidas, truncado,
            caracteres: Math.min(texto.length, PDF_MAX_CARACTERES),
            hash: crypto.createHash('sha256').update(bytes).digest('hex'),
            traidoEn: new Date().toISOString(),
          },
        }
      } catch (e) {
        return { ok: false, valor: { porQue: `no pude leer el PDF: ${String(e?.message ?? e).slice(0, 160)}` } }
      } finally {
        clearTimeout(t)
        if (tmp) { try { fs.unlinkSync(tmp) } catch { /* ya no está */ } }
      }
    },
  })
  if (!valor || (!deCache && !ok)) return { ok: false, url: String(url), formato: 'pdf', caracteres: 0, porQue: valor?.porQue ?? porQue ?? 'no se pudo leer', sinModelo: true }
  return { ok: true, ...valor, url: valor.url ?? String(url), deCache, sinModelo: true }
}

/** ¿Esta dirección promete un PDF? Por la extensión o por el tipo que el buscador declaró. PURA. */
export const pareceriaPdf = (url, tipo = null) => /\.pdf(\?|#|$)/i.test(String(url)) || /\bpdf\b/i.test(String(tipo ?? ''))
