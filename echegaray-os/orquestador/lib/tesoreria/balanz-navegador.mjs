// NAVEGADOR DE BALANZ — SOLO LECTURA, sobre la sesión que el dueño ya tiene abierta.
//
// ═══ CÓMO SE REUSA LA SESIÓN, Y POR QUÉ ASÍ ═══
//
// Se conecta por CDP a un Chrome que el dueño ya arrancó y donde YA inició sesión a mano. No copia el
// perfil, no lee contraseñas guardadas, no exporta cookies, no persiste tokens y no automatiza login,
// OTP ni CAPTCHA. Si la sesión no está, el ciclo se detiene con SESSION_REQUIRED y avisa — nunca
// intenta entrar.
//
// La alternativa descartada fue lanzar un Chromium propio con `userDataDir` apuntando al perfil del
// dueño: funciona, y es exactamente lo que el pedido prohíbe (copiar el perfil). Además fuerza a
// cerrar el Chrome real, porque el perfil no admite dos procesos.
//
// ═══ LA BARRERA VA ANTES DE CADA INTERACCIÓN ═══
//
// Toda navegación y todo clic pasan por `balanz-denylist.mjs`. La barrera no está acá para que no se
// pueda desactivar editando el navegador: es un módulo puro, con sus propios tests, y este archivo
// es sólo quien la llama. Si alguien la saltea, el test de integración de abajo se pone rojo.
//
// ═══ LO QUE ESTE ARCHIVO NUNCA HACE ═══
//
// No hace clic en nada que la barrera no haya permitido explícitamente. No completa formularios. No
// guarda capturas de pantalla del sitio autenticado (tienen saldos y datos de cuenta). No escribe
// credenciales en ningún log.

import { evaluarElemento, evaluarNavegacion, registroBloqueo } from './balanz-denylist.mjs'

export const ENDPOINT_CDP = process.env.ORQ_BALANZ_CDP || 'http://127.0.0.1:9222'
export const ORIGEN_BALANZ = 'https://clientes.balanz.com'

export class SesionRequerida extends Error {
  constructor(motivo) {
    super(`SESSION_REQUIRED: ${motivo}`)
    this.code = 'SESSION_REQUIRED'
    this.motivo = motivo
  }
}

/**
 * ¿Hay un Chrome con puerto de depuración escuchando? Es lo único que se chequea antes de intentar
 * nada: sin esto no hay sesión que reusar, y el ciclo tiene que parar en vez de improvisar.
 */
export async function sesionDisponible(endpoint = ENDPOINT_CDP, fetchImpl = fetch) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3000)
    const r = await fetchImpl(`${endpoint}/json/version`, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    if (!r.ok) return { disponible: false, motivo: `el endpoint respondió ${r.status}` }
    const v = await r.json()
    return { disponible: true, navegador: String(v.Browser || 'desconocido') }
  } catch (e) {
    return { disponible: false, motivo: `no hay Chrome escuchando en ${endpoint} (${String(e?.message ?? e).slice(0, 80)})` }
  }
}

/**
 * Abre la conexión CDP con Playwright. Se importa acá adentro y no arriba a propósito: Playwright es
 * devDependency, y el resto del agente —incluida toda la parte financiera— tiene que poder correr en
 * el worker de producción sin él instalado.
 */
async function conectar(endpoint) {
  let chromium
  try { ({ chromium } = await import('playwright')) } catch {
    try { ({ chromium } = await import('@playwright/test')) } catch {
      throw new SesionRequerida('playwright no está disponible en este entorno')
    }
  }
  const browser = await chromium.connectOverCDP(endpoint)
  const ctx = browser.contexts()[0]
  if (!ctx) { await browser.close(); throw new SesionRequerida('el navegador no tiene ningún contexto abierto') }
  return { browser, ctx }
}

/**
 * ¿La página está autenticada? Se decide por lo que se VE, no por una cookie: buscar la cookie de
 * sesión sería leer credenciales, que es justo lo prohibido. Si aparece un formulario de login o la
 * URL cayó en /login, la sesión venció.
 */
export async function verificarSesion(page) {
  const url = String(page.url() || '')
  if (/\/(login|signin|ingresar|auth)/i.test(url)) throw new SesionRequerida('la página está en el login: la sesión venció')
  const hayLogin = await page.locator('input[type="password"]').count().catch(() => 0)
  if (hayLogin > 0) throw new SesionRequerida('hay un campo de contraseña en pantalla: la sesión venció')
  return true
}

/** Navega a una URL informativa. La barrera decide primero; si dice que no, no se navega. */
export async function navegarSeguro(page, url, bloqueos = []) {
  const v = evaluarNavegacion(url)
  if (!v.permitido) {
    bloqueos.push(registroBloqueo({ tag: 'url', texto: url }, v))
    return { navegado: false, motivo: v.motivo }
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await verificarSesion(page)
  return { navegado: true }
}

/**
 * Los atributos de un elemento que la barrera necesita. Es una FUNCIÓN, no un string: Playwright
 * serializa la función y la corre en la página, y un string con cuerpo de bloque puede resolverse
 * como una función sin llamarla —que fue exactamente lo que devolvía `undefined` en silencio—.
 *
 * ═══ EL CONTENEDOR, NO EL PADRE ═══
 *
 * `parentElement.innerText` de un elemento de primer nivel es EL TEXTO DE TODA LA PÁGINA. Con eso,
 * cualquier link de una pantalla que en algún lado diga "Invertir" quedaba bloqueado: en la prueba
 * contra un DOM real, el link al prospecto —inofensivo— caía por el texto de un botón que estaba a
 * quinientos píxeles. Un agente que bloquea todo no es prudente: es inútil, y además esconde los
 * bloqueos que sí importan entre cientos que no.
 *
 * Se usa el CONTENEDOR más cercano con significado —modal, formulario, fila, ítem de lista— y sólo si
 * es chico. Un "Aceptar" dentro de un modal que dice "Confirmá tu suscripción" sigue bloqueado, que
 * es el caso que esto tiene que atrapar.
 */
export function extraerAtributos(el) {
  const form = el.closest('form')
  const cont = el.closest('[role=dialog],[role=alertdialog],dialog,form,tr,li,[class*=modal],[class*=card]')
  const textoCont = cont && cont !== el ? (cont.innerText || '') : ''
  return {
    tag: el.tagName,
    rol: el.getAttribute('role'),
    tipo: el.getAttribute('type'),
    texto: (el.innerText || el.textContent || '').slice(0, 200),
    ariaLabel: el.getAttribute('aria-label'),
    title: el.getAttribute('title'),
    href: el.getAttribute('href'),
    action: el.getAttribute('action'),
    formAction: el.getAttribute('formaction'),
    dataUrl: el.getAttribute('data-url'),
    // Un contenedor largo no dice nada del elemento: 400 caracteres es una fila o un modal, no una
    // pantalla entera.
    textoPadre: textoCont.length <= 400 ? textoCont.slice(0, 200) : '',
    tituloModal: cont?.matches?.('[role=dialog],[role=alertdialog],dialog,[class*=modal]') ? textoCont.slice(0, 200) : null,
    // Un control dentro de un formulario puede enviarlo. En una pantalla informativa no hay nada que
    // leer ahí adentro, así que se bloquea entero.
    dentroDeFormulario: Boolean(form) && form !== el,
  }
}

/**
 * Clic con barrera. Es el ÚNICO camino por el que este agente toca algo en Balanz: no hay un
 * `page.click` suelto en todo el módulo, y el test lo verifica leyendo este archivo.
 */
export async function clicSeguro(page, selector, bloqueos = []) {
  const loc = page.locator(selector).first()
  if (!(await loc.count())) return { clicado: false, motivo: 'el selector no existe' }
  const el = await loc.evaluate(extraerAtributos).catch(() => ({}))
  const v = evaluarElemento(el)
  if (!v.permitido) {
    bloqueos.push(registroBloqueo(el, v))
    return { clicado: false, motivo: v.motivo, bloqueado: true }
  }
  await loc.click({ timeout: 10000 })
  await verificarSesion(page)
  return { clicado: true }
}

/**
 * AUDITORÍA DE LA PANTALLA: evalúa TODOS los controles visibles y devuelve cuántos quedarían
 * bloqueados. No se usa para decidir un clic —para eso está `clicSeguro`— sino como evidencia de que
 * la barrera vio la pantalla real y la clasificó.
 */
export async function auditarControles(page) {
  const els = await page.locator('a, button, input[type=submit], form')
    .evaluateAll((nodos, f) => nodos.slice(0, 400).map(new Function('el', `return (${f})(el)`)), extraerAtributos.toString())
    .catch(() => [])
  const bloqueados = []
  let permitidos = 0
  for (const el of els) {
    const v = evaluarElemento(el)
    if (v.permitido) permitidos += 1
    else bloqueados.push(registroBloqueo(el, v))
  }
  return { total: els.length, permitidos, bloqueados }
}

/**
 * RELEVAMIENTO. Recorre las rutas informativas que se le pasen y devuelve, por cada una, el texto
 * plano visible y la auditoría de controles. La extracción de instrumentos NO se hace acá: este
 * módulo entrega texto crudo con su procedencia y `instrumentos.mjs` lo normaliza. Separarlo es lo
 * que permite testear el normalizador sin navegador.
 *
 * @returns {Promise<{estado:'ok'|'session_required', paginas:Array, bloqueos:Array, observado_en:string}>}
 */
export async function relevar({ rutas = [], endpoint = ENDPOINT_CDP } = {}) {
  const disp = await sesionDisponible(endpoint)
  if (!disp.disponible) {
    return { estado: 'session_required', motivo: disp.motivo, paginas: [], bloqueos: [], observado_en: new Date().toISOString() }
  }
  const { browser, ctx } = await conectar(endpoint)
  const bloqueos = []
  const paginas = []
  const page = ctx.pages()[0] || await ctx.newPage()
  try {
    for (const ruta of rutas) {
      const url = ruta.startsWith('http') ? ruta : `${ORIGEN_BALANZ}${ruta}`
      const nav = await navegarSeguro(page, url, bloqueos)
      if (!nav.navegado) { paginas.push({ url, estado: 'bloqueada', motivo: nav.motivo }); continue }
      await page.waitForTimeout(1200)
      const texto = await page.locator('body').innerText().catch(() => '')
      const controles = await auditarControles(page)
      bloqueos.push(...controles.bloqueados)
      paginas.push({ url, estado: 'ok', texto: String(texto).slice(0, 60000), controles: { total: controles.total, permitidos: controles.permitidos, bloqueados: controles.bloqueados.length } })
    }
    return { estado: 'ok', paginas, bloqueos, observado_en: new Date().toISOString() }
  } catch (e) {
    if (e instanceof SesionRequerida) {
      return { estado: 'session_required', motivo: e.motivo, paginas, bloqueos, observado_en: new Date().toISOString() }
    }
    throw e
  } finally {
    // Se cierra la CONEXIÓN, nunca el navegador del dueño: `browser.close()` sobre una conexión CDP
    // desconecta, pero si el contexto fuera propio cerraría su Chrome. Por eso no se cierran páginas.
    await browser.close().catch(() => {})
  }
}
