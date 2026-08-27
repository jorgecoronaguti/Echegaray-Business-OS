// LEER UNA PÁGINA CONCRETA. La búsqueda dice dónde está; esto va y trae el texto.
//
// ═══ POR QUÉ HACE FALTA, SI YA HAY BÚSQUEDA ═══
//
// La búsqueda devuelve el RESUMEN que hizo un modelo. Sirve para orientarse y no sirve para citar:
// cuando el dato decide algo —una alícuota, un tramo de paritaria, una resolución— hay que leer la
// página, guardar la URL y poder mostrar de dónde salió. Un resumen sin la fuente abierta es
// exactamente lo que la regla de oro prohíbe.
//
// ═══ LA GUARDA QUE NO ES OPCIONAL ═══
//
// Una URL la puede proponer el modelo, y el modelo la puede haber sacado de una página. Es decir:
// el destino del pedido puede venir de contenido no confiable. Por eso `urlPermitida` bloquea
// todo lo que no sea internet pública: localhost, la red privada de la VM, el metadata server de
// la nube (la vía clásica para robar credenciales de instancia), y cualquier esquema que no sea
// http/https. Es SSRF, y el atacante no necesita entrar a la VM: le alcanza con que el OS lea una
// página suya que le pida leer otra.
//
// El texto que vuelve NO se devuelve suelto: sale por `aplicarPoliticaContenidoExterno`.

import { aplicarPoliticaContenidoExterno, ORIGEN_EXTERNO } from './contenido-externo.mjs'

export const MAX_BYTES = 1_500_000
export const MAX_CARACTERES = 24_000
export const TIMEOUT_MS = 15_000

/** Tipos que se saben convertir en texto. Un binario cualquiera no se descarga «a ver qué es». */
const TIPOS_ACEPTADOS = [/^text\/html/i, /^application\/xhtml\+xml/i, /^text\/plain/i, /^text\/markdown/i, /^application\/json/i, /^text\/xml/i, /^application\/xml/i]

// Rangos que NUNCA se piden desde acá. No es paranoia teórica: la VM tiene Postgres, el bot y el
// servidor interactivo escuchando en localhost, y el metadata server responde sin autenticación.
const HOSTS_PROHIBIDOS = [
  /^localhost$/i, /^127\./, /^0\.0\.0\.0$/, /^\[?::1\]?$/i,
  /^10\./, /^192\.168\./, /^169\.254\./, /^metadata(\.google\.internal)?$/i,
  /\.local$/i, /\.internal$/i,
]

/** 172.16.0.0/12 no se puede escribir con un prefijo simple: 172.16–172.31 sí, 172.32 no. */
function esPrivada172(host) {
  const m = /^172\.(\d{1,3})\./.exec(host)
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31
}

/** ¿Se puede pedir esta URL? Devuelve {ok} o {ok:false, motivo}. PURA. */
export function urlPermitida(url) {
  let u
  try { u = new URL(String(url)) } catch { return { ok: false, motivo: 'no es una URL válida' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, motivo: `esquema no permitido: ${u.protocol} (solo http/https)` }
  }
  const host = u.hostname.toLowerCase()
  if (!host) return { ok: false, motivo: 'la URL no tiene host' }
  if (u.username || u.password) return { ok: false, motivo: 'no se piden URLs con credenciales embebidas' }
  if (HOSTS_PROHIBIDOS.some((re) => re.test(host)) || esPrivada172(host)) {
    return { ok: false, motivo: `host de red interna o reservada: ${host}` }
  }
  return { ok: true, url: u.toString() }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', deg: '°', euro: '€', laquo: '«', raquo: '»' }

/** Decodifica las entidades que aparecen de verdad en páginas en español. PURA. */
export function decodificarEntidades(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (Object.hasOwn(ENTIDADES, n) ? ENTIDADES[n] : m))
}

/** Título de la página, o null. PURA. */
export function tituloDe(html) {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(html ?? ''))
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() || null : null
}

/**
 * Fecha de publicación declarada por la página. Se busca en el orden en que las páginas serias la
 * ponen. Si no está, devuelve null y NO se estima: una fecha inventada convierte un dato viejo en
 * un dato vigente, que es exactamente el error que más caro sale en normativa. PURA.
 */
export function publicadoEnDe(html) {
  const h = String(html ?? '')
  const patrones = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["'](?:date|pubdate|publish[-_]?date|DC\.date(?:\.issued)?)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ]
  for (const re of patrones) {
    const m = re.exec(h)
    if (m && !Number.isNaN(new Date(m[1]).getTime())) return new Date(m[1]).toISOString()
  }
  return null
}

/** HTML → texto legible. Tira lo que nunca aporta (script, style, nav, footer, svg) y conserva el
 *  corte de párrafo, que es lo que hace que un modelo entienda la estructura. PURA. */
export function htmlATexto(html, { maxCaracteres = MAX_CARACTERES } = {}) {
  const limpio = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|table|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodificarEntidades(limpio)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxCaracteres)
}

/** ¿El content-type se sabe leer? PURA. */
export function tipoAceptado(contentType) {
  const t = String(contentType || '')
  return TIPOS_ACEPTADOS.some((re) => re.test(t))
}

/**
 * LEE una URL y devuelve el envoltorio canónico de contenido externo. Nunca lanza por culpa del
 * sitio: un destino caído o bloqueado devuelve `{error}` y el trabajo sigue.
 * `fetchImpl` entra por parámetro para poder testear sin red.
 */
export async function leerUrl(url, { fetchImpl = fetch, maxCaracteres = MAX_CARACTERES, timeoutMs = TIMEOUT_MS, consulta = null, ahora = new Date() } = {}) {
  const guarda = urlPermitida(url)
  if (!guarda.ok) return { error: `no puedo leer esa dirección: ${guarda.motivo}` }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetchImpl(guarda.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'EchegarayOS/1.0 (+https://app.ecsas.com.ar)', Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9' },
    })
  } catch (e) {
    return { error: `no pude abrir ${guarda.url}: ${String(e?.message ?? e).slice(0, 140)}` }
  } finally { clearTimeout(t) }
  if (!res?.ok) return { error: `${guarda.url} respondió ${res?.status ?? '(sin status)'}` }

  // Un redirect puede terminar en la red interna: se vuelve a controlar el destino FINAL.
  const finalUrl = res.url || guarda.url
  const guardaFinal = urlPermitida(finalUrl)
  if (!guardaFinal.ok) return { error: `la dirección redirigió a un destino no permitido: ${guardaFinal.motivo}` }

  const ct = res.headers?.get?.('content-type') || ''
  if (!tipoAceptado(ct)) return { error: `no sé leer ese tipo de contenido (${ct || 'desconocido'}). Para PDF usá la lectura de Drive.` }
  const largo = Number(res.headers?.get?.('content-length') || 0)
  if (largo && largo > MAX_BYTES) return { error: `la página pesa ${largo} bytes: es más de lo que se lee por esta vía` }

  const crudo = String(await res.text()).slice(0, MAX_BYTES)
  const esHtml = /html|xml/i.test(ct)
  const texto = esHtml ? htmlATexto(crudo, { maxCaracteres }) : crudo.slice(0, maxCaracteres)
  return aplicarPoliticaContenidoExterno({
    texto,
    origen: ORIGEN_EXTERNO.WEB,
    url: finalUrl,
    titulo: esHtml ? tituloDe(crudo) : null,
    consulta,
    obtenidoEn: ahora.toISOString(),
    publicadoEn: esHtml ? publicadoEnDe(crudo) : null,
    ahora,
  })
}
