// LA BARRERA TRANSACCIONAL DE BALANZ — lo único de este agente que no puede fallar nunca.
//
// ═══ POR QUÉ ES UN MÓDULO PURO Y NO UNA INSTRUCCIÓN EN EL PROMPT ═══
//
// El README de `.claude/agents/` ya lo dice con la sangre de seis pérdidas: **una prohibición escrita
// no es un control**. "No hagas clic en Comprar" en un prompt no impide hacer clic en Comprar. Esto
// es una función determinística, sin modelo, sin red y sin estado, que se corre ANTES de cada
// interacción y devuelve permitido/bloqueado. Un test la puede romper a propósito; un párrafo no.
//
// ═══ EL CRITERIO: FALLA CERRADA ═══
//
// Ante la duda NO se hace clic. Este repo ya pagó el precio contrario —una guarda que no encontró la
// base que esperaba y siguió adelante borró una pestaña entera—. Acá el default es bloquear: si el
// elemento no se puede evaluar (sin texto, sin rol, sin href), está bloqueado.
//
// ═══ QUÉ NO HACE ═══
//
// No decide qué es una oportunidad ni lee un precio. Sólo responde una pregunta: *¿tocar esto puede
// iniciar una operación financiera?* Si la respuesta es "no estoy seguro", es "sí".

/**
 * RAÍCES transaccionales, no palabras completas.
 *
 * ═══ EL AGUJERO QUE ESTO CIERRA ═══
 *
 * La primera versión listaba infinitivos y sustantivos: `vender`, `invertir`, `confirmar`. Balanz es
 * un bróker argentino y sus botones están en VOSEO imperativo. La auditoría lo ejecutó:
 *
 *   PERMITIDO  Vendé · Invertí · Suscribí · Operá · Rescatá · Confirmá · Aceptá · Caucioná · Adherí
 *
 * Nueve CTA transaccionales pasaban. `Comprá` caía sólo por casualidad, porque el sustantivo
 * "compra" estaba en la lista. Este repo ya había aprendido exactamente esto en el ruteo del chat
 * —el voseo rompe los verbos, hay que trabajar con RAÍCES— y la lección no se había traído acá.
 *
 * Ahora cada entrada es una raíz que matchea desde el comienzo de la palabra: `vend` atrapa vender,
 * vendé, vendo, venden, vendiendo, venta y ventas. Es deliberadamente amplio: en una pantalla
 * informativa un falso positivo cuesta no leer un dato; un falso negativo cuesta una orden enviada.
 */
export const RAICES_PROHIBIDAS = [
  'compr', 'vend', 'vent', 'suscrib', 'suscripcion', 'rescat', 'transfer',
  'confirm', 'acept', 'oper', 'orden', 'invert', 'renov', 'licit',
  'firm', 'autoriz', 'caucion', 'coloc', 'ejecut', 'deposit', 'retir',
  'extra', 'pag', 'cobr', 'canje', 'canjea', 'adher', 'contrat',
  // Verbos que un bróker usa para "operar" sin decir "operar".
  'constitu', 'aplic', 'adquir', 'liquid', 'ingres', 'egres', 'mandat',
]

/** Frases transaccionales que ninguna raíz sola atrapa. */
export const FRASES_PROHIBIDAS = [
  'enviar orden', 'continuar operacion', 'confirmar operacion', 'si quiero', 'estoy de acuerdo',
]

/**
 * Se conserva por compatibilidad y porque documenta el pedido original del dueño. La evaluación
 * real usa `RAICES_PROHIBIDAS`, que las cubre a todas.
 */
export const VERBOS_PROHIBIDOS = [
  'comprar', 'vender', 'suscribir', 'rescatar', 'transferir', 'confirmar', 'aceptar', 'operar',
  'enviar orden', 'invertir', 'renovar', 'licitar', 'firmar', 'autorizar',
  'continuar operacion', 'confirmar operacion', 'caucionar',
]

/** Rutas/acciones que son transaccionales por su URL aunque el texto sea inocente ("Continuar"). */
export const RUTAS_PROHIBIDAS = [
  '/comprar', '/vender', '/suscri', '/rescat', '/operar', '/orden', '/transferenc',
  '/caucion', '/licitac', '/confirmar', '/checkout', '/pagos', '/extraccion', '/deposito',
  '/constitu', '/nueva', '/alta', '/solicitud',
]

/** Rutas explícitamente informativas: no habilitan nada por sí solas, pero sí ayudan a decidir. */
export const RUTAS_INFORMATIVAS = [
  '/cotizacion', '/precios', '/mercado', '/instrumento', '/detalle', '/ficha', '/prospecto',
  '/reglamento', '/factsheet', '/rendimiento', '/informacion', '/ayuda', '/glosario',
]

/** Quita tildes, colapsa espacios y baja a minúscula. El texto de un sitio real no viene prolijo. */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿El texto contiene una RAÍZ transaccional al comienzo de una palabra?
 *
 * La raíz se ancla al principio de la palabra, no en cualquier posición: así `compr` atrapa
 * "Comprá" y "compraste" pero no "descompresión", y `pag` atrapa "Pagá" pero no "despagina".
 */
export function contieneVerboProhibido(texto) {
  const t = normalizar(texto)
  if (!t) return null
  for (const f of FRASES_PROHIBIDAS) {
    if (new RegExp(`(^|[^a-z0-9])${f.replace(/ /g, '[\\s,]+')}`).test(t)) return f
  }
  for (const r of RAICES_PROHIBIDAS) {
    if (new RegExp(`(^|[^a-z0-9])${r}`).test(t)) return r
  }
  return null
}

/** ¿La URL/acción cae en una ruta transaccional? */
export function rutaProhibida(url) {
  const u = normalizar(url)
  if (!u) return null
  return RUTAS_PROHIBIDAS.find((r) => u.includes(r)) ?? null
}

/**
 * Los atributos donde puede esconderse la intención de un control. El orden importa poco; lo que
 * importa es que sean TODOS: un botón con texto "→" y aria-label "Confirmar compra" es una orden.
 */
const CAMPOS_TEXTO = ['texto', 'ariaLabel', 'title', 'nombreAccesible', 'valor', 'placeholder', 'textoPadre', 'tituloModal', 'tituloPantalla']
const CAMPOS_URL = ['href', 'action', 'formAction', 'dataUrl', 'ruta']

/**
 * DECIDE SI UN ELEMENTO SE PUEDE TOCAR. Pura: recibe una descripción del elemento (ya extraída del
 * DOM por el navegador) y devuelve el veredicto con su motivo.
 *
 * @param {object} el descripción del elemento
 * @returns {{permitido:boolean, motivo:string, coincidencia:string|null, campo:string|null}}
 */
export function evaluarElemento(el = {}) {
  // 1 · Los campos de texto: el verbo manda esté donde esté.
  for (const campo of CAMPOS_TEXTO) {
    const v = contieneVerboProhibido(el[campo])
    if (v) return { permitido: false, motivo: `verbo transaccional "${v}" en ${campo}`, coincidencia: v, campo }
  }
  // 2 · Las URLs y acciones: una ruta transaccional bloquea aunque el texto sea "Continuar".
  //
  // Y también se les corre el chequeo de RAÍCES, que antes sólo se aplicaba a las navegaciones. La
  // asimetría la encontró la auditoría: `/plazo-fijo/constituir` y `/inversiones/nueva` pasaban por
  // clic y caían por navegación — y el clic es el lado peligroso.
  for (const campo of CAMPOS_URL) {
    const r = rutaProhibida(el[campo])
    if (r) return { permitido: false, motivo: `ruta transaccional "${r}" en ${campo}`, coincidencia: r, campo }
    const v = contieneVerboProhibido(String(el[campo] ?? '').replace(/[/?=&_.-]+/g, ' '))
    if (v) return { permitido: false, motivo: `raíz transaccional "${v}" en la URL de ${campo}`, coincidencia: v, campo }
  }
  // 3 · UN FORMULARIO ES UNA ORDEN EN POTENCIA — y todo lo que vive adentro también.
  //
  // La versión anterior exigía `rol === 'button'` para bloquear un submit, y un `<button
  // type="submit">` normal no declara `role`. El test contra un DOM real lo encontró: el botón
  // "Continuar" del formulario de suscripción quedaba PERMITIDO. En un bróker ese botón es la orden.
  //
  // Ahora: cualquier `type=submit` cae, tenga el rol que tenga; y cualquier elemento DENTRO de un
  // formulario cae también, porque un control dentro de un form puede enviarlo. Es deliberadamente
  // amplio: en una pantalla informativa no hay nada que leer adentro de un formulario.
  if (normalizar(el.tipo) === 'submit') {
    return { permitido: false, motivo: 'botón de submit: enviar un formulario en un bróker es operar', coincidencia: 'submit', campo: 'tipo' }
  }
  if (normalizar(el.tag) === 'form' || normalizar(el.rol) === 'form') {
    return { permitido: false, motivo: 'es un formulario', coincidencia: 'form', campo: 'tag' }
  }
  if (el.dentroDeFormulario) {
    return { permitido: false, motivo: 'está dentro de un formulario: cualquier control ahí adentro puede enviarlo', coincidencia: 'form', campo: 'dentroDeFormulario' }
  }
  // 4 · FALLA CERRADA. Un elemento del que no sabemos nada no se toca. No es paranoia: es que el
  //     costo de no hacer clic es cero y el de hacerlo mal es una orden enviada con plata real.
  const tieneAlgoQueLeer = CAMPOS_TEXTO.some((c) => normalizar(el[c])) || CAMPOS_URL.some((c) => normalizar(el[c]))
  if (!tieneAlgoQueLeer) {
    return { permitido: false, motivo: 'elemento sin texto ni destino evaluable: ante la duda no se toca', coincidencia: null, campo: null }
  }
  return { permitido: true, motivo: 'sin verbos ni rutas transaccionales', coincidencia: null, campo: null }
}

/**
 * ALLOWLIST DE NAVEGACIÓN INFORMATIVA — la excepción quirúrgica para cauciones.
 *
 * ═══ EL PROBLEMA ═══
 *
 * "Caucionar" es operar, así que `caucion` está en la denylist. Pero `/mercado/cauciones` es la
 * PANTALLA donde se leen las tasas de caución, que es información legítima y valiosa para tesorería.
 * La primera versión resolvió el choque sacando la ruta del relevamiento: correcto como default
 * seguro, pero deja a la empresa sin ver el instrumento de corto plazo más usado del mercado local.
 *
 * ═══ POR QUÉ ESTA EXCEPCIÓN NO ABRE LA PUERTA ═══
 *
 * 1. Es por RUTA EXACTA, no por prefijo. `/mercado/cauciones` pasa; `/mercado/cauciones/operar` NO,
 *    `/mercado/caucionar` NO, `/mercado/cauciones-nueva` NO. Un prefijo habría sido exactamente el
 *    agujero que se quería evitar.
 * 2. Vale SÓLO para navegar. `evaluarElemento` no la consulta nunca: un botón "Caucionar" dentro de
 *    esa misma pantalla sigue bloqueado, y un formulario también. Se puede mirar, no tocar.
 * 3. El query string se descarta antes de comparar y se evalúa aparte, para que
 *    `/mercado/cauciones?accion=caucionar` no entre por la ventana.
 */
export const DOMINIOS_BALANZ = ['balanz.com', 'balanz.com.ar']

export function dominioDe(url) {
  const u = String(url ?? '').trim()
  if (!u) return null
  // Sólo se resuelve contra la base lo que ES una ruta del propio sitio (`/algo`). Un string suelto
  // como "no-es-una-url" resolvía a `clientes.balanz.com` y pasaba como si fuera de Balanz: el parser
  // trataba cualquier texto como ruta relativa. Lo que no es ni ruta ni URL absoluta, no tiene host.
  const esRutaPropia = u.startsWith('/') && !u.startsWith('//')
  const esAbsoluta = u.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(u)
  if (!esRutaPropia && !esAbsoluta) return null
  try { return new URL(u, 'https://clientes.balanz.com').hostname.toLowerCase() || null } catch { return null }
}

/**
 * ¿La URL es de Balanz? Por sufijo de host con punto delante — lo único que no se falsifica con un
 * nombre parecido: `balanz.com.evil.io` y `notbalanz.com` NO pasan.
 *
 * Vive en la BARRERA, no en el navegador, porque la auditoría encontró que estar en `verificarSesion`
 * la dejaba corriendo DESPUÉS del `page.goto`: la pestaña autenticada del dueño ya había navegado al
 * host ajeno cuando saltaba el error. Un control que llega tarde no es un control.
 */
export function esDominioBalanz(url) {
  const h = dominioDe(url)
  if (!h) return false
  return DOMINIOS_BALANZ.some((x) => h === x || h.endsWith(`.${x}`))
}

export const NAVEGACION_INFORMATIVA = new Set([
  '/mercado/cauciones',
  '/cauciones',
  '/mercado/cauciones/listado',
  '/mercado/cauciones/tasas',
])

/** Path exacto, sin query, sin hash y sin barra final. Devuelve null si la URL no parsea. */
export function rutaExacta(url) {
  const u = String(url ?? '').trim()
  if (!u) return null
  let path
  try { path = new URL(u, 'https://clientes.balanz.com').pathname } catch { return null }
  return path.replace(/\/+$/, '') || '/'
}

/** ¿La ruta está en la allowlist informativa, por coincidencia EXACTA? */
export function esNavegacionInformativa(url) {
  const p = rutaExacta(url)
  return p != null && NAVEGACION_INFORMATIVA.has(p)
}

/** El query string y el hash, que se evalúan aparte de la allowlist. */
function extras(url) {
  try { const u = new URL(String(url), 'https://clientes.balanz.com'); return `${u.search} ${u.hash}` } catch { return '' }
}

/** Una navegación directa por URL. Mismo criterio, sin DOM. */
export function evaluarNavegacion(url) {
  if (!normalizar(url)) return { permitido: false, motivo: 'URL vacía', coincidencia: null, campo: 'url' }
  // EL HOST, ANTES QUE TODO. `https://atacante.example/mercado/cauciones` entraba por la allowlist,
  // que comparaba sólo el pathname. Y `//evil.com/...` también, porque el parser lo resuelve como
  // protocolo relativo. Fuera del dominio de Balanz no se navega, informativa o no.
  if (!esDominioBalanz(url)) {
    return { permitido: false, motivo: `${dominioDe(url) ?? 'destino ilegible'} no es un dominio de Balanz`, coincidencia: dominioDe(url), campo: 'host' }
  }
  // La allowlist se consulta primero, PERO el query string se sigue evaluando: la excepción es de la
  // ruta, no de todo lo que venga colgado de ella.
  if (esNavegacionInformativa(url)) {
    const q = extras(url).replace(/[?#=&_-]+/g, ' ')
    const vq = contieneVerboProhibido(q)
    if (vq) return { permitido: false, motivo: `la ruta es informativa pero el query trae "${vq}"`, coincidencia: vq, campo: 'query' }
    return { permitido: true, motivo: 'allowlist de navegación informativa (ruta exacta)', coincidencia: null, campo: null, allowlist: true }
  }
  const r = rutaProhibida(url)
  if (r) return { permitido: false, motivo: `ruta transaccional "${r}"`, coincidencia: r, campo: 'url' }
  const v = contieneVerboProhibido(String(url).replace(/[/?=&_-]+/g, ' '))
  if (v) return { permitido: false, motivo: `verbo transaccional "${v}" en la URL`, coincidencia: v, campo: 'url' }
  return { permitido: true, motivo: 'ruta informativa', coincidencia: null, campo: null }
}

/**
 * REGISTRO DE BLOQUEOS. Se guarda qué se bloqueó y por qué, nunca el contenido de la pantalla: una
 * captura de un bróker autenticado tiene saldos y datos de cuenta que este agente no necesita.
 */
export function registroBloqueo(el = {}, veredicto = {}) {
  return {
    en: new Date().toISOString(),
    motivo: veredicto.motivo ?? null,
    coincidencia: veredicto.coincidencia ?? null,
    campo: veredicto.campo ?? null,
    // Sólo la etiqueta y el rol: suficiente para auditar, insuficiente para reconstruir la pantalla.
    elemento: { tag: el.tag ?? null, rol: el.rol ?? null, texto: String(el.texto ?? '').slice(0, 80) || null },
  }
}
