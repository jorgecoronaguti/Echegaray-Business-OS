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
 * Verbos transaccionales. Van sin acento y en minúscula porque la comparación normaliza; el texto
 * real de Balanz mezcla mayúsculas, tildes y espacios finos.
 *
 * La lista es la del pedido del dueño, más las variantes que un sitio real usa para lo mismo. Agregar
 * un término acá es barato; que falte uno cuesta una orden enviada.
 */
export const VERBOS_PROHIBIDOS = [
  'comprar', 'compra', 'vender', 'venta', 'suscribir', 'suscripcion', 'rescatar', 'rescate',
  'transferir', 'transferencia', 'confirmar', 'confirmacion', 'aceptar', 'operar', 'operacion',
  'enviar orden', 'ordenar', 'invertir', 'renovar', 'renovacion', 'licitar', 'licitacion',
  'firmar', 'firma', 'autorizar', 'autorizacion', 'continuar operacion', 'confirmar operacion',
  'caucionar', 'caucion', 'colocar', 'ejecutar', 'aplicar fondos', 'depositar', 'retirar',
  'extraer', 'pagar', 'cobrar', 'canjear', 'canje', 'adherir', 'contratar',
]

/** Rutas/acciones que son transaccionales por su URL aunque el texto sea inocente ("Continuar"). */
export const RUTAS_PROHIBIDAS = [
  '/comprar', '/vender', '/suscri', '/rescat', '/operar', '/orden', '/transferenc',
  '/caucion', '/licitac', '/confirmar', '/checkout', '/pagos', '/extraccion', '/deposito',
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

/** ¿El texto contiene un verbo transaccional como PALABRA, no como subcadena? */
export function contieneVerboProhibido(texto) {
  const t = normalizar(texto)
  if (!t) return null
  for (const v of VERBOS_PROHIBIDOS) {
    // Frontera de palabra a mano: `\b` no sirve con frases ("enviar orden") ni con acentos ya quitados.
    const re = new RegExp(`(^|[^a-z0-9])${v.replace(/ /g, '\\s+')}($|[^a-z0-9])`)
    if (re.test(t)) return v
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
  for (const campo of CAMPOS_URL) {
    const r = rutaProhibida(el[campo])
    if (r) return { permitido: false, motivo: `ruta transaccional "${r}" en ${campo}`, coincidencia: r, campo }
  }
  // 3 · UN FORMULARIO ES UNA ORDEN EN POTENCIA. `submit` no se toca nunca: lo que envía un formulario
  //     en un bróker es, por definición, algo que el bróker va a procesar.
  if (normalizar(el.rol) === 'button' && normalizar(el.tipo) === 'submit') {
    return { permitido: false, motivo: 'botón de submit: enviar un formulario en un bróker es operar', coincidencia: 'submit', campo: 'tipo' }
  }
  if (normalizar(el.tag) === 'form' || normalizar(el.rol) === 'form') {
    return { permitido: false, motivo: 'es un formulario', coincidencia: 'form', campo: 'tag' }
  }
  // 4 · FALLA CERRADA. Un elemento del que no sabemos nada no se toca. No es paranoia: es que el
  //     costo de no hacer clic es cero y el de hacerlo mal es una orden enviada con plata real.
  const tieneAlgoQueLeer = CAMPOS_TEXTO.some((c) => normalizar(el[c])) || CAMPOS_URL.some((c) => normalizar(el[c]))
  if (!tieneAlgoQueLeer) {
    return { permitido: false, motivo: 'elemento sin texto ni destino evaluable: ante la duda no se toca', coincidencia: null, campo: null }
  }
  return { permitido: true, motivo: 'sin verbos ni rutas transaccionales', coincidencia: null, campo: null }
}

/** Una navegación directa por URL. Mismo criterio, sin DOM. */
export function evaluarNavegacion(url) {
  const r = rutaProhibida(url)
  if (r) return { permitido: false, motivo: `ruta transaccional "${r}"`, coincidencia: r, campo: 'url' }
  const v = contieneVerboProhibido(String(url).replace(/[/?=&_-]+/g, ' '))
  if (v) return { permitido: false, motivo: `verbo transaccional "${v}" en la URL`, coincidencia: v, campo: 'url' }
  if (!normalizar(url)) return { permitido: false, motivo: 'URL vacía', coincidencia: null, campo: 'url' }
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
