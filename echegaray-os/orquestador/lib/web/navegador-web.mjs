// EL NAVEGADOR, Y SÓLO CUANDO HACE FALTA DE VERDAD.
//
// ═══ POR QUÉ NO ES LA VÍA POR DEFECTO ═══
//
// `leerUrl` cuesta un fetch y 200 ms. Un navegador cuesta un proceso, ~300 MB y varios segundos, y
// además ejecuta el JavaScript del sitio — o sea, le da a un tercero un motor completo dentro de la
// VM. Se usa cuando el contenido NO existe sin interacción: una SPA que renderiza en el cliente, un
// listado que sólo aparece después de un clic, un buscador de organismo que exige apretar «Buscar».
// Si el dato está en el HTML, esto no se usa.
//
// ═══ LO QUE NO HACE ═══
//
// No inicia sesión, no completa contraseñas, no resuelve CAPTCHA, no guarda cookies ni perfiles.
// Es la misma línea que ya trazó `tesoreria/balanz-navegador.mjs` para el broker, y por el mismo
// motivo: automatizar un login es asumir una identidad, y eso no lo decide un modelo.
//
// El guión se valida ANTES de abrir nada, con una función pura y testeable. Playwright se importa
// adentro a propósito: la mayoría de las corridas del OS no lo necesitan y no tienen por qué pagar
// su carga.

import { aplicarPoliticaContenidoExterno, ORIGEN_EXTERNO } from './contenido-externo.mjs'
import { htmlATexto, urlPermitida, MAX_CARACTERES } from './web-lectura.mjs'

export const ACCIONES = Object.freeze(['ir', 'esperar', 'click', 'escribir', 'captura'])
export const MAX_PASOS = 12

/** Campos que este navegador NUNCA completa. No alcanza con «no le pidas la contraseña»: el guión
 *  lo puede haber propuesto un modelo que leyó una página hostil. */
const CAMPO_SECRETO = /(pass|contrase|clave|pin|otp|token|secret|cvv|tarjeta|card)/i

/**
 * ¿El guión es ejecutable? Devuelve {ok, pasos} o {ok:false, motivo}. PURA — es la barrera, y una
 * barrera que necesita un navegador para probarse no se puede probar.
 */
export function validarGuion(pasos) {
  if (!Array.isArray(pasos) || !pasos.length) return { ok: false, motivo: 'el guión está vacío' }
  if (pasos.length > MAX_PASOS) return { ok: false, motivo: `el guión tiene ${pasos.length} pasos: el máximo es ${MAX_PASOS}` }
  if (pasos[0]?.accion !== 'ir') return { ok: false, motivo: 'el primer paso tiene que ser "ir" a una URL' }
  for (const [i, p] of pasos.entries()) {
    const n = i + 1
    if (!ACCIONES.includes(p?.accion)) return { ok: false, motivo: `paso ${n}: acción desconocida "${p?.accion}" (permitidas: ${ACCIONES.join(', ')})` }
    if (p.accion === 'ir') {
      const g = urlPermitida(p.url)
      if (!g.ok) return { ok: false, motivo: `paso ${n}: ${g.motivo}` }
    }
    if ((p.accion === 'click' || p.accion === 'escribir') && !p.selector) {
      return { ok: false, motivo: `paso ${n}: "${p.accion}" necesita selector` }
    }
    if (p.accion === 'escribir') {
      if (typeof p.texto !== 'string') return { ok: false, motivo: `paso ${n}: "escribir" necesita texto` }
      if (CAMPO_SECRETO.test(String(p.selector)) || CAMPO_SECRETO.test(String(p.texto))) {
        return { ok: false, motivo: `paso ${n}: este navegador no completa campos de credenciales. Si el sitio pide sesión, la abre una persona.` }
      }
    }
    if (p.accion === 'esperar' && Number(p.ms) > 15_000) return { ok: false, motivo: `paso ${n}: espera de más de 15 s` }
  }
  return { ok: true, pasos }
}

/** ¿Hay navegador instalado en esta máquina? No se asume: la VM puede no tenerlo y el trabajo
 *  tiene que decirlo claro en vez de fallar con un stack de Playwright. */
export async function navegadorDisponible() {
  try {
    const { chromium } = await import('playwright')
    const ruta = chromium.executablePath?.()
    return ruta ? { disponible: true, ruta } : { disponible: false, motivo: 'playwright está, pero no hay binario de Chromium instalado' }
  } catch (e) {
    return { disponible: false, motivo: `no hay Playwright en esta máquina (${String(e?.message ?? e).slice(0, 80)})` }
  }
}

/**
 * Ejecuta el guión y devuelve el texto final de la página como contenido externo. `captura` en
 * base64 sólo si el guión lo pidió. Nunca lanza: un sitio que no coopera devuelve {error}.
 */
export async function navegar(pasos, { maxCaracteres = MAX_CARACTERES, timeoutMs = 30_000, ahora = new Date() } = {}) {
  const guion = validarGuion(pasos)
  if (!guion.ok) return { error: `guión rechazado: ${guion.motivo}` }
  const disp = await navegadorDisponible()
  if (!disp.disponible) return { error: `no puedo abrir un navegador acá: ${disp.motivo}` }

  const { chromium } = await import('playwright')
  let navegador = null
  const hechos = []
  let captura = null
  try {
    navegador = await chromium.launch({ headless: true })
    const contexto = await navegador.newContext({ userAgent: 'EchegarayOS/1.0 (+https://app.ecsas.com.ar)' })
    const pagina = await contexto.newPage()
    pagina.setDefaultTimeout(Math.min(timeoutMs, 30_000))
    for (const p of guion.pasos) {
      if (p.accion === 'ir') { await pagina.goto(p.url, { waitUntil: 'domcontentloaded' }); hechos.push(`ir ${p.url}`) }
      else if (p.accion === 'esperar') { await pagina.waitForTimeout(Math.min(Number(p.ms) || 1000, 15_000)); hechos.push(`esperar ${p.ms || 1000}ms`) }
      else if (p.accion === 'click') { await pagina.click(p.selector); hechos.push(`click ${p.selector}`) }
      else if (p.accion === 'escribir') { await pagina.fill(p.selector, p.texto); hechos.push(`escribir en ${p.selector}`) }
      else if (p.accion === 'captura') { captura = (await pagina.screenshot({ fullPage: false })).toString('base64'); hechos.push('captura') }
    }
    // El destino REAL después de toda la navegación: un clic puede haber salido a otro dominio.
    const urlFinal = pagina.url()
    const g = urlPermitida(urlFinal)
    if (!g.ok) return { error: `la navegación terminó en un destino no permitido: ${g.motivo}` }
    const html = await pagina.content()
    const titulo = await pagina.title().catch(() => null)
    const r = aplicarPoliticaContenidoExterno({
      texto: htmlATexto(html, { maxCaracteres }),
      origen: ORIGEN_EXTERNO.NAVEGADOR,
      url: urlFinal,
      titulo: titulo || null,
      obtenidoEn: ahora.toISOString(),
      ahora,
    })
    return { ...r, pasos_ejecutados: hechos, captura_base64: captura }
  } catch (e) {
    return { error: `el navegador no pudo completar el guión: ${String(e?.message ?? e).slice(0, 180)}`, pasos_ejecutados: hechos }
  } finally {
    await navegador?.close().catch(() => {})
  }
}
