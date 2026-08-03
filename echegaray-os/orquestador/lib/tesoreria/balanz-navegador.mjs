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

import {
  evaluarElemento, evaluarNavegacion, registroBloqueo, esDominioBalanz, dominioDe,
} from './balanz-denylist.mjs'

// La guarda de dominio vive en la barrera (se re-exporta para no romper a los consumidores): tiene
// que poder decidir ANTES del `goto`, no después.
export { esDominioBalanz, dominioDe }

export const ENDPOINT_CDP = process.env.ORQ_BALANZ_CDP || 'http://127.0.0.1:9222'
export const ORIGEN_BALANZ = 'https://clientes.balanz.com'

/**
 * Cuánto se espera a que la SPA termine de rutear antes de controlar y de leer. El sitio reescribe la
 * URL hasta ~3 s después del `domcontentloaded`: cualquier control que corra antes mira una pantalla
 * que todavía no es la definitiva.
 */
export const ESPERA_SPA_MS = Number(process.env.ORQ_BALANZ_ESPERA_MS || 2500)

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
/**
 * BUSCA LA PESTAÑA AUTENTICADA. No abre una nueva, y eso es una corrección, no una comodidad.
 *
 * ═══ POR QUÉ LA PESTAÑA PROPIA NO PODÍA FUNCIONAR NUNCA ═══
 *
 * El diseño original abría `ctx.newPage()` con un argumento razonable: no pasearle al dueño su
 * pestaña por siete URLs dos veces por día. Contra el sitio real no funciona, y no por un detalle
 * ajustable:
 *
 *   cookies del contexto:  0
 *   sessionStorage:        plataforma-clientes-v2_currentAccount, _parametrosNegocio, … (6 claves)
 *   localStorage:          plataforma-clientes-v2_bdid
 *
 * Balanz no guarda la sesión en cookies: la guarda en `sessionStorage`, que es **por pestaña**. Una
 * pestaña nueva del mismo navegador y del mismo perfil nace deslogueada por definición. El
 * explorador, corrido con la sesión del dueño abierta y andando, devolvía `SESSION_REQUIRED`.
 *
 * Así que se usa la pestaña que YA tiene la sesión, y se le devuelve la URL donde estaba al terminar.
 * Se sigue sin tocar cookies, sin leer tokens y sin exportar nada: se navega y se lee, nada más.
 */
export function buscarPestanaAutenticada(paginas = []) {
  return paginas.find((p) => {
    const u = String(p.url() || '')
    return esDominioBalanz(u) && !/\/(login|signin|ingresar|auth)/i.test(u)
  }) || null
}

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
 * MARCAS DE LA PANTALLA DE INGRESO DE BALANZ, tomadas del login real (2026-08-02, versión 2.35.1).
 *
 * ═══ POR QUÉ HIZO FALTA AGREGARLAS ═══
 *
 * La primera versión decidía "la sesión venció" por dos señales: la URL en `/login` y un
 * `input[type=password]` en pantalla. Contra el sitio vivo las dos fallan del lado cómodo:
 *
 *   · el login de Balanz es en DOS PASOS y el primero pide sólo el usuario — no hay ni un campo de
 *     contraseña en el DOM (verificado: `input[type=password]` devuelve 0);
 *   · con lo cual la única señal que quedaba en pie era la URL, y alcanza con que el bróker sirva el
 *     ingreso como overlay sobre la misma ruta —o renombre `/auth/login`— para que `verificarSesion`
 *     dé por buena una pantalla de login.
 *
 * Y el costo de ese fallo no es un error: es peor. `relevar` devolvería `estado:'ok'` con el texto
 * del login, el extractor no encontraría instrumentos, y el ciclo informaría "el mercado no tiene
 * nada" en lugar de "no pude ver el mercado". Convertir un ciego en un cero es exactamente el defecto
 * que este módulo viene arreglando en otras seis partes.
 *
 * Se exige que coincidan DOS marcas, no una: con una sola, una frase suelta en un pie de página
 * autenticado dejaría al agente desconectado para siempre, que es el fallo opuesto y también caro.
 *
 * ═══ POR QUÉ NO ESTÁ ACÁ LA ADVERTENCIA DE SEGURIDAD ═══
 *
 * El login trae "No compartas tus datos de acceso o Código de Operación por mensajes...". Es la marca
 * más tentadora y la más peligrosa: es la típica leyenda que un bróker repite en TODAS sus pantallas,
 * incluidas las autenticadas. Peor todavía, esa sola oración contiene dos frases distintas — con lo
 * cual un único pie de página alcanzaría para llegar al umbral de dos y bloquear al agente sin que
 * haya ningún login. Queda afuera a propósito.
 *
 * Las que quedan son propias del acto de ingresar y no tienen razón de existir en una pantalla de
 * fondos. Contra el login vivo disparan tres.
 */
export const MARCAS_DE_LOGIN = [
  'olvide o bloquee', 'olvide mi usuario', 'olvide mi contrasena', 'recuperar contrasena',
  'activar usuario', 'crear usuario',
  'comenza a invertir', 'iniciar sesion', 'ingresa con tu usuario',
]

/** Sin tildes y en minúscula: el texto de un sitio real no viene prolijo. */
const plano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')

/** ¿Cuántas marcas de pantalla de ingreso tiene este texto? Pura, para poder testearla sin navegador. */
export function marcasDeLogin(texto) {
  const t = plano(texto)
  return MARCAS_DE_LOGIN.filter((m) => t.includes(m))
}

/**
 * ¿La página está autenticada? Se decide por lo que se VE, no por una cookie: buscar la cookie de
 * sesión sería leer credenciales, que es justo lo prohibido. Si aparece un formulario de login, si el
 * texto tiene las marcas del ingreso, o si la URL cayó en /login, la sesión venció.
 */
export async function verificarSesion(page, { exigirDominio = true } = {}) {
  const url = String(page.url() || '')
  // EL DOMINIO PRIMERO. El Chrome dedicado puede tener otras pestañas, y una redirección puede llevar
  // a un dominio de terceros. Leer y clasificar controles de una pantalla que no es Balanz no sólo es
  // inútil: si esa pantalla fuera hostil, estaría dictando lo que el agente cree ver.
  // Un host VACÍO (`about:blank`, `data:`) no es "otro dominio": es "todavía no hay página". No tiene
  // contenido que leer ni controles que tocar, así que no hay nada de qué protegerse.
  const host = dominioDe(url)
  if (exigirDominio && host && !esDominioBalanz(url)) {
    throw new SesionRequerida(`la página está en ${host}, no en Balanz: no se lee ni se toca nada fuera del dominio`)
  }
  if (/\/(login|signin|ingresar|auth)/i.test(url)) throw new SesionRequerida('la página está en el login: la sesión venció')
  const hayLogin = await page.locator('input[type="password"]').count().catch(() => 0)
  if (hayLogin > 0) throw new SesionRequerida('hay un campo de contraseña en pantalla: la sesión venció')
  // LA TERCERA SEÑAL, la que no depende de la URL ni del campo de contraseña (ver MARCAS_DE_LOGIN).
  const texto = await page.locator('body').innerText().catch(() => '')
  const marcas = marcasDeLogin(texto)
  if (marcas.length >= 2) {
    throw new SesionRequerida(`la pantalla es el ingreso de Balanz (${marcas.slice(0, 3).join(', ')}): la sesión venció`)
  }
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
  // ═══ ESPERAR A QUE LA SPA SE ASIENTE, ANTES DE CONTROLAR NADA ═══
  //
  // `domcontentloaded` es t0: Balanz reescribe la URL con su router HASTA ~3 s después. Los dos
  // controles corrían en ese t0 y después `relevar` esperaba 1200 ms y recién ahí leía — o sea que
  // controlaban una pantalla y se guardaba otra. Reproducido con un redirect diferido a 600 ms:
  // `navegarSeguro` decía `navegado:true` sobre /bonos y lo que se leía era el ticker de /app/home.
  // La guarda escrita para impedir exactamente eso no lo impedía en el camino de producción.
  await page.waitForTimeout(ESPERA_SPA_MS)
  await verificarSesion(page)
  // La sesión puede estar perfecta y la pantalla ser OTRA (ver `llegoADestino`). Se chequea después
  // de `verificarSesion` porque un redirect al login tiene que reportarse como sesión vencida, que es
  // lo accionable, y no como "no llegué".
  if (!llegoADestino(url, page.url())) {
    return { navegado: false, motivo: `la ruta no existe: Balanz redirigió a ${page.url()}`, redirigido_a: page.url() }
  }
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
 * ESTRUCTURA SEMÁNTICA DE LA PÁGINA — encabezados, tablas con sus columnas, listas, tabs, paginación.
 *
 * Vive acá y no en el script del explorador por dos motivos: se pasa como FUNCIÓN (un string, en
 * cualquiera de sus dos formas, devuelve `undefined` en silencio — verificado contra Chromium), y así
 * se puede probar contra una página real sin necesitar una sesión de Balanz.
 *
 * Sirve para elegir selectores semánticos —rol, nombre accesible, encabezado de tabla— en vez de
 * clases CSS, que cambian con cada despliegue del bróker.
 */
export function estructuraDePagina() {
  const texto = (el) => (el?.innerText || '').trim().slice(0, 120)
  const encabezados = [...document.querySelectorAll('h1,h2,h3,[role=heading]')].slice(0, 40)
    .map((h) => ({ nivel: h.tagName.toLowerCase(), texto: texto(h) }))
  const tablas = [...document.querySelectorAll('table,[role=table],[role=grid]')].slice(0, 20).map((t, i) => {
    const cabecera = [...t.querySelectorAll('th,[role=columnheader]')].map(texto).filter(Boolean)
    const cuerpo = [...t.querySelectorAll('tbody tr')]
    return {
      i,
      cabecera,
      filas: cuerpo.length,
      muestra: cuerpo.slice(0, 3).map((r) => [...r.querySelectorAll('td,[role=cell],[role=gridcell]')].map(texto)),
      tieneAria: Boolean(t.getAttribute('aria-label')),
    }
  })
  const listas = [...document.querySelectorAll('[role=list],ul')].slice(0, 10)
    .map((l) => ({ items: l.children.length, primero: texto(l.children[0]) }))
    .filter((l) => l.items > 2 && l.primero)
  const tabs = [...document.querySelectorAll('[role=tab],[role=tablist] button')].slice(0, 20).map(texto).filter(Boolean)
  const paginacion = [...document.querySelectorAll('[aria-label*=agina],[class*=pagina],[class*=pagination]')].length
  return {
    titulo: document.title,
    url: location.href,
    encabezados, tablas, listas, tabs, paginacion,
    alto: document.body.scrollHeight,
    visible: window.innerHeight,
  }
}

/**
 * Baja hasta el final para que carguen las filas diferidas. Scrollear NO es tocar un control.
 *
 * ═══ LA VENTANA NO ES LA QUE SCROLLEA ═══
 *
 * La versión anterior movía `window` y medía `document.body.scrollHeight`. En la app real de Balanz
 * el `body` NO scrollea —`scrollHeight` y `innerHeight` valen los dos 788— porque el contenido vive
 * dentro de un `section.content.overflow-y-scroll` con su propio scroll (4154 contra 749 de alto
 * visible). O sea: la primera vuelta medía el mismo alto que la anterior, la función devolvía 0 y
 * se daba por satisfecha sin haber disparado una sola carga.
 *
 * El costo estaba medido y era grande. Con el scroll arreglado, en la misma sesión:
 *
 *   bonos     20 → 189 filas
 *   cedears   20 → 260 filas
 *   cauciones 20 → 164 filas
 *   letras    20 →  65 filas
 *
 * El agente elegía "la mejor alternativa" entre las primeras 20 filas alfabéticas de cada pantalla y
 * lo informaba como si hubiera mirado el mercado. No es un bug de rendimiento: es una recomendación
 * hecha sobre el 8% de los datos, presentada sin ninguna marca de que faltaba el resto.
 *
 * Se mide el crecimiento por CANTIDAD DE FILAS además de por altura: un contenedor virtualizado puede
 * reciclar los nodos y mantener el alto constante mientras cambia el contenido.
 */
// TOPE SUBIDO DE 15 A 45 (03/08/2026). Con 15 vueltas, `corporativos` y `cedears` terminaban en 320
// filas y el ciclo se declaraba NO_ACCIONABLE por "relevamiento truncado" — o sea, el tope impedía
// recomendar, que es justo para lo que existe el módulo. El bucle corta solo cuando la pantalla deja
// de crecer, así que subir el techo no cuesta tiempo en las chicas: sólo deja terminar a las grandes.
export async function cargarTodo(page, vueltas = 120) {
  let firma = ''
  let estables = 0
  for (let i = 0; i < vueltas; i += 1) {
    const nueva = await page.evaluate(async () => {
      // El scroller real: el elemento con scroll propio más alto de la página. Si no hay ninguno
      // —una pantalla corta—, se cae a la ventana, que es el comportamiento clásico.
      const cand = [...document.querySelectorAll('*')]
        .filter((e) => e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 200)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
      if (cand) cand.scrollTop = cand.scrollHeight
      else window.scrollTo(0, document.body.scrollHeight)
      const alto = cand ? cand.scrollHeight : document.body.scrollHeight
      return `${alto}:${document.querySelectorAll('tbody tr').length}:${document.querySelectorAll('[class*=fondo-item]').length}`
    })
    if (nueva === firma) {
      // DOS lecturas iguales, no una. Con una sola muestra a 700 ms, un lote que tarde 800 ms en
      // llegar hacía que la pantalla se declarara completa con 20 filas de 189 — el mismo número que
      // tenían bonos y cauciones ANTES del arreglo de scroll, o sea indistinguible del defecto viejo.
      if (estables >= 1) return { vueltas: i, completo: true }
      estables += 1
      await page.waitForTimeout(900)
      continue
    }
    estables = 0
    firma = nueva
    await page.waitForTimeout(700)
  }
  // SE ACABARON LAS VUELTAS Y LA PANTALLA SEGUÍA CRECIENDO. No es lo mismo que haber terminado, y la
  // diferencia importa: en el relevamiento del 02/08/2026 corporativos y cedears llegaron al tope con
  // 320 filas cada uno, o sea que puede haber más y nadie lo estaba diciendo. Un relevamiento
  // truncado que se informa como completo es la misma familia de defecto que este módulo viene
  // corrigiendo: no falla, contesta de menos.
  return { vueltas, completo: false }
}

/**
 * ¿La navegación llegó a donde pidió? Balanz responde a una ruta que no existe **redirigiendo a
 * `/app/home` sin ningún error**: `/app/cotizaciones/on`, `/etf` y `/lecaps` terminan todas ahí.
 *
 * Y `/app/home` es una pantalla autenticada y legítima de Balanz, así que `verificarSesion` la
 * aprueba. El relevamiento se llevaba el ticker de la portada —TAMAR, S&P MERVAL, los ETF del
 * encabezado— y lo devolvía como si fuera el listado de obligaciones negociables que se había pedido.
 * Otra vez el mismo patrón: no falla, contesta otra cosa.
 */
export function llegoADestino(urlPedida, urlFinal) {
  const ruta = (u) => { try { return new URL(u, ORIGEN_BALANZ).pathname.replace(/\/+$/, '').toLowerCase() } catch { return null } }
  const pedida = ruta(urlPedida)
  const final = ruta(urlFinal)
  if (!pedida || !final) return false
  return final === pedida || final.startsWith(`${pedida}/`)
}

/**
 * LEE LA TABLA DE COTIZACIONES tal como la dibuja Balanz. Se pasa como FUNCIÓN (un string devuelve
 * `undefined` en silencio) y se corre dentro de la página.
 *
 * Las pantallas de acciones, bonos, cedears, letras, cauciones y corporativos SÍ son `<table>` con
 * `<th>`, así que el mapeo por encabezado de `instrumentos.mjs` sirve tal cual. Lo único que hay que
 * limpiar acá es lo que el DOM mete dentro de las celdas y no es dato:
 *
 * · la primera celda trae `TICKER⏎NOMBRE LARGO` en dos líneas → se parten en dos campos;
 * · la última celda es el libro de puntas, con los botones "Vender"/"Comprar" adentro. Su texto
 *   ("10 × 960,00 Vender 995,00 × 89 Comprar") no es un dato de mercado utilizable y además mete
 *   verbos transaccionales en el texto que después se guarda. Se descarta.
 */
export function leerTablaCotizaciones() {
  const limpio = (el) => (el?.innerText || '').replace(/\u00a0/g, ' ').trim()
  const t = document.querySelector('table')
  if (!t) return null
  const cabCruda = [...t.querySelectorAll('th')].map(limpio)
  const filasCrudas = [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map(limpio))
  if (!cabCruda.length) return { cabecera: cabCruda, filas: filasCrudas, normalizada: false }

  // 1 · FUERA LAS COLUMNAS SIN ENCABEZADO. En la tabla real son dos: la primera (el ícono de
  //     "seguir") y la última, que es el libro de puntas — y esa última trae los botones "Vender" y
  //     "Comprar" adentro, con lo cual su texto mete verbos transaccionales en el dato guardado.
  const utiles = cabCruda.map((h, i) => (h ? i : -1)).filter((i) => i >= 0)
  let cabecera = utiles.map((i) => cabCruda[i])
  let filas = filasCrudas.map((f) => utiles.map((i) => f[i] ?? ''))

  // 2 · PARTIR TICKER Y NOMBRE. La tabla NO tiene columna "Nombre": la primera celda trae
  //     `ALUA⏎ALUAR S.A. ORDS 1 VOTO ESCRITURALES` en dos renglones. Sin esto `mapearColumnas` no
  //     encuentra columna de nombre y `extraerDeTabla` devuelve CERO instrumentos, con un motivo que
  //     nadie mira — que es exactamente lo que pasaba con las cinco pantallas de cotizaciones.
  const iTicker = cabecera.findIndex((h) => /^ticker$/i.test(h))
  if (iTicker >= 0 && filas.some((f) => String(f[iTicker] ?? '').includes('\n'))) {
    cabecera = [...cabecera.slice(0, iTicker + 1), 'Nombre', ...cabecera.slice(iTicker + 1)]
    filas = filas.map((f) => {
      const [tk, ...resto] = String(f[iTicker] ?? '').split('\n').map((x) => x.trim())
      return [...f.slice(0, iTicker), tk, resto.join(' ').trim(), ...f.slice(iTicker + 1)]
    })
  }
  return { cabecera, filas, normalizada: true }
}

/**
 * LEE LAS TARJETAS DE FONDOS. La pantalla de fondos no es una tabla: son tarjetas `div.fondo-item`
 * con pares etiqueta→valor. Contra la app real hay CERO `<table>`, CERO `<th>`, CERO encabezados
 * `h1..h6`, CERO `[role=tab]` y CERO `<li>` — 1579 `<div>` y nada más.
 *
 * Por eso se lee por ETIQUETA y no por posición, que es la misma regla que este repo aplica a las
 * columnas de Compras y a las tablas de arriba: el orden de los bloques cambia con cada despliegue,
 * los rótulos casi nunca.
 *
 * La tasa se toma SÓLO del rótulo "TNA:" que la tarjeta trae explícito. Las variaciones
 * Diaria/Semanal/Mensual/Anual son rendimiento PASADO y se devuelven aparte, nunca como tasa: en la
 * pantalla real sólo 2 de 10 fondos declaran TNA, y llamar "tasa" al 44,21% anual de un fondo de
 * renta fija sería exactamente inventar una expectativa donde hay un histórico.
 */
export function leerTarjetasDeFondos() {
  const limpio = (el) => (el?.innerText || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const tarjetas = [...document.querySelectorAll('[class*="fondo-item"]')]
  return tarjetas.map((c) => {
    // Pares etiqueta→valor: un div de rótulo seguido de su hermano con el valor.
    const pares = {}
    for (const el of c.querySelectorAll('div')) {
      if (el.children.length) continue
      const k = limpio(el).replace(/:$/, '')
      const sig = el.nextElementSibling
      if (k && sig && !sig.children.length) pares[k] = limpio(sig)
    }
    const badge = c.querySelector('[class*="fondo-badge"]')
    const moneda = c.querySelector('[class*="badge-moneda"]')
    // El nombre: el primer div hoja con clase de título dentro de la tarjeta.
    const nombreEl = c.querySelector('[class*="text-size-6"]') || c.querySelector('[class*="fw-semibold"]')
    // "TNA: +17,81%" — el rótulo y su span viven en el mismo bloque.
    const bloqueTna = [...c.querySelectorAll('div')].find((e) => /^TNA\s*:/i.test(limpio(e)))
    return {
      nombre: limpio(nombreEl),
      plazo_rescate_texto: limpio(badge) || null,
      moneda_texto: limpio(moneda) || null,
      perfil: pares['Perfíl'] ?? pares.Perfil ?? null,
      tipo: pares.Tipo ?? null,
      horizonte: pares.Horizonte ?? null,
      tna_texto: bloqueTna ? limpio(bloqueTna) : null,
      variaciones: {
        diaria: pares.Diaria ?? null,
        semanal: pares.Semanal ?? null,
        mensual: pares.Mensual ?? null,
        anual: pares.Anual ?? null,
      },
      texto: limpio(c).slice(0, 400),
    }
  }).filter((f) => f.nombre)
}

/** Todos los controles de la página, ya extraídos para la barrera. */
// 400 dejaba 4 pantallas enteras por la mitad (bonos, corporativos, cauciones, cedears): el barrido
// se reportaba parcial y bloqueaba la accionabilidad. 2.000 cubre el universo relevado —1.108
// instrumentos— con margen, y el tope sigue existiendo para que una pantalla rota no cuelgue el ciclo.
export const TOPE_CONTROLES = 8000

export async function controlesDePagina(page) {
  return page.locator('a, button, input[type=submit], form')
    .evaluateAll((nodos, f, tope) => nodos.slice(0, tope).map(new Function('el', `return (${f})(el)`)),
      extraerAtributos.toString(), TOPE_CONTROLES)
    .catch(() => [])
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
  const els = await controlesDePagina(page)
  const bloqueados = []
  // LO QUE UNA BARRERA TIENE QUE PODER MOSTRAR NO ES QUÉ FRENÓ: ES QUÉ DEJÓ PASAR. Antes se guardaban
  // diez ejemplos de bloqueos y CERO permitidos, con lo cual la evidencia no permitía revisar la
  // única lista que importa auditar. Son etiquetas cortas: no reconstruyen la pantalla.
  const permitidos = []
  for (const el of els) {
    const v = evaluarElemento(el)
    if (v.permitido) permitidos.push(String(el.texto || el.ariaLabel || el.tag || '').trim().replace(/\s+/g, ' ').slice(0, 60))
    else bloqueados.push(registroBloqueo(el, v))
  }
  return {
    total: els.length,
    permitidos: permitidos.length,
    etiquetas_permitidas: [...new Set(permitidos)].filter(Boolean),
    bloqueados,
    // Un total clavado en el tope no es "había 400": es "no los vi a todos", y hay que decirlo.
    barrido_completo: els.length < TOPE_CONTROLES,
  }
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
  // LA PESTAÑA DEL DUEÑO ES LA ÚNICA QUE TIENE SESIÓN (ver `buscarPestanaAutenticada`): Balanz la
  // guarda en `sessionStorage`, que no se comparte entre pestañas.
  const page = buscarPestanaAutenticada(ctx.pages())
  if (!page) {
    await browser.close().catch(() => {})
    return {
      estado: 'session_required',
      motivo: 'no hay ninguna pestaña de Balanz abierta con sesión iniciada en el Chrome dedicado',
      paginas: [], bloqueos: [], observado_en: new Date().toISOString(),
    }
  }
  const urlOriginal = page.url() // se la devolvemos como estaba al terminar
  try {
    for (const ruta of rutas) {
      const url = ruta.startsWith('http') ? ruta : `${ORIGEN_BALANZ}${ruta}`
      try {
        const nav = await navegarSeguro(page, url, bloqueos)
        if (!nav.navegado) {
          paginas.push({ url, estado: nav.redirigido_a ? 'no_existe' : 'bloqueada', motivo: nav.motivo })
          continue
        }
        // `navegarSeguro` ya esperó a que la SPA se asiente y RECIÉN AHÍ controló destino y sesión.
        // No se vuelve a esperar acá: esa espera intermedia era justamente lo que hacía que el
        // control y la lectura miraran pantallas distintas.
        //
        // Primero cargar TODO (el scroller real, no la ventana): sin esto se leen 20 filas de 189.
        const carga = await cargarTodo(page)
        const texto = await page.locator('body').innerText().catch(() => '')
        // Y LEER LA ESTRUCTURA, no sólo el texto plano. El texto de una tarjeta pone el nombre y la
        // tasa en renglones distintos, así que un extractor por línea no puede juntarlos: contra la
        // pantalla real devolvía dos instrumentos llamados "TNA: +" y ninguno de los diez fondos.
        const tabla = await page.evaluate(leerTablaCotizaciones).catch(() => null)
        const tarjetas = await page.evaluate(leerTarjetasDeFondos).catch(() => [])
        const controles = await auditarControles(page)
        bloqueos.push(...controles.bloqueados)
        paginas.push({
          url,
          estado: 'ok',
          texto: String(texto).slice(0, 60000),
          tabla,
          tarjetas,
          carga: { vueltas: carga.vueltas, completo: carga.completo },
          // Si la carga quedó truncada, el relevamiento de esta pantalla NO es completo y hay que
          // decirlo acá: quien lea 320 filas tiene que saber si son todas o las primeras 320.
          relevamiento_completo: carga.completo,
          controles: {
            total: controles.total,
            permitidos: controles.permitidos,
            etiquetas_permitidas: controles.etiquetas_permitidas,
            bloqueados: controles.bloqueados.length,
            barrido_completo: controles.barrido_completo,
          },
        })
      } catch (e) {
        // UNA PANTALLA QUE FALLA NO PUEDE LLEVARSE EL ANÁLISIS ENTERO. Un `goto` que agotaba los 30 s
        // en la quinta ruta tiraba también el tramo de caja, que ya estaba bien calculado. La sesión
        // vencida SÍ corta todo —no tiene sentido seguir sin sesión— y por eso se relanza.
        if (e instanceof SesionRequerida) throw e
        paginas.push({ url, estado: 'error', motivo: String(e?.message ?? e).split('\n')[0].slice(0, 160) })
      }
    }
    return { estado: 'ok', paginas, bloqueos, observado_en: new Date().toISOString() }
  } catch (e) {
    if (e instanceof SesionRequerida) {
      return { estado: 'session_required', motivo: e.motivo, paginas, bloqueos, observado_en: new Date().toISOString() }
    }
    throw e
  } finally {
    // La pestaña es DEL DUEÑO: no se cierra, se le devuelve la URL donde estaba. La CONEXIÓN se corta
    // con `browser.close()`, que sobre CDP desconecta sin matar el Chrome.
    if (urlOriginal && page.url() !== urlOriginal && esDominioBalanz(urlOriginal)) {
      await page.goto(urlOriginal, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    }
    await browser.close().catch(() => {})
  }
}
