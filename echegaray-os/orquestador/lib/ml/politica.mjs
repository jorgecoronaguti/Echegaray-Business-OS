// QUÉ DATO PUEDE SALIR DE LA EMPRESA, Y HACIA DÓNDE. EL ROUTER PREGUNTA ACÁ ANTES DE ELEGIR.
//
// ═══ POR QUÉ ES UNA PUERTA Y NO UNA RECOMENDACIÓN ═══
//
// Un modelo local y uno remoto se llaman igual desde el código; la diferencia es que el segundo
// manda el contenido a un tercero. Si esa diferencia depende de que cada módulo se acuerde, un día
// un legajo va a viajar por una llamada que alguien escribió apurado. Por eso el permiso se
// resuelve ACÁ, el router lo consulta SIEMPRE, y no hay forma de pedir un proveedor externo sin
// pasar por esta función.
//
// ═══ EL DEFAULT ES EL MÁS RESTRICTIVO, A PROPÓSITO ═══
//
// Un dato sin clasificar se trata como CONFIDENTIAL, no como INTERNAL. El costo de equivocarse en
// una dirección es que algo se procese local y más lento; en la otra, que salga de la empresa.

/** Las cuatro categorías. Ordenadas de menos a más sensible. */
export const SENSIBILIDAD = Object.freeze({
  PUBLIC: 'public',              // ya es público: normativa, precios de lista, un pliego publicado
  INTERNAL: 'internal',          // interno sin daño si sale: nombres de actividades, unidades, rubros
  CONFIDENTIAL: 'confidential',  // el negocio: precios, márgenes, obras, proveedores, cotizaciones
  RESTRICTED: 'restricted',      // no sale nunca: credenciales, banco, legajos, fiscal, datos personales
})

const ORDEN = [SENSIBILIDAD.PUBLIC, SENSIBILIDAD.INTERNAL, SENSIBILIDAD.CONFIDENTIAL, SENSIBILIDAD.RESTRICTED]

/**
 * QUÉ ES RESTRICTED. La lista sale del pedido del dueño, y se escribe como dominios del OS para que
 * un caller no tenga que interpretarla: si el dato viene de acá, ya está clasificado.
 */
const DOMINIOS_RESTRICTED = new Set([
  'credenciales', 'banco', 'extracto', 'cheques', 'caja', 'tesoreria',
  'legajo', 'nomina', 'sueldos', 'recibos', 'jornales', 'uocra', 'ieric',
  'fiscal', 'impuestos', 'arca', 'ddjj', 'datos-personales', 'cuit-persona',
])

const DOMINIOS_CONFIDENTIAL = new Set([
  'compras', 'proveedores', 'cobranzas', 'clientes', 'obras', 'presupuestos',
  'cotizaciones', 'contratos', 'certificados', 'margenes', 'precios',
])

const DOMINIOS_INTERNAL = new Set([
  'actividades', 'wbs', 'partidas', 'unidades', 'rubros', 'materiales-catalogo',
  'consultas', 'intenciones', 'documentacion-tecnica',
])

/** La sensibilidad de un dominio del OS. Lo que no está declarado es CONFIDENTIAL: el default es el
 *  restrictivo, nunca el cómodo. */
export function sensibilidadDe(dominio) {
  const d = String(dominio ?? '').trim().toLowerCase()
  if (DOMINIOS_RESTRICTED.has(d)) return SENSIBILIDAD.RESTRICTED
  if (DOMINIOS_CONFIDENTIAL.has(d)) return SENSIBILIDAD.CONFIDENTIAL
  if (DOMINIOS_INTERNAL.has(d)) return SENSIBILIDAD.INTERNAL
  if (d === 'publico' || d === 'public') return SENSIBILIDAD.PUBLIC
  return SENSIBILIDAD.CONFIDENTIAL
}

/**
 * ¿PUEDE ESTE CONTENIDO IR A UN PROVEEDOR EXTERNO?
 *
 * Claude es un proveedor externo y ya procesa datos CONFIDENTIAL del OS todos los días —el Director,
 * el cotizador, la lectura de comprobantes—: esa relación ya existe y está contratada. Hugging Face
 * remoto NO: es una relación nueva, y hasta que el dueño la autorice por escrito para un caso
 * concreto, el techo es INTERNAL.
 *
 * `permitidoExplicitamente` es esa autorización, y es por caso: no hay un interruptor global.
 */
export function puedeSalir(dominio, proveedor, { permitidoExplicitamente = false } = {}) {
  const d = String(dominio ?? '').trim().toLowerCase()
  const s = sensibilidadDe(dominio)
  const nivel = ORDEN.indexOf(s)

  // Local nunca sale: siempre se puede, sea cual sea la sensibilidad.
  if (proveedor === 'local' || proveedor === 'postgres' || proveedor == null) {
    return { permitido: true, sensibilidad: s, porQue: 'no sale de la VM' }
  }

  // ═══ CLAUDE NO ES «UN PROVEEDOR EXTERNO MÁS», Y TRATARLO ASÍ ROMPE PRODUCCIÓN ═══
  //
  // La primera versión de esta función bloqueaba `banco` para Claude por ser RESTRICTED. Es
  // incorrecto y además destructivo: el briefing de caja, el Director y el CFO ya le mandan la
  // posición bancaria todos los días, y esa relación es la que el `CLAUDE.md` de la raíz declara
  // como el sistema mismo. Lo que el dueño pidió impedir es que un dato sensible se vaya a un
  // proveedor NUEVO sin autorización, no cortar el que ya opera.
  //
  // Lo único que no viaja a NINGÚN lado, ni siquiera a Claude, son las credenciales: una clave en un
  // prompt queda en un transcript, y un transcript no es una caja fuerte.
  if (proveedor === 'anthropic' || proveedor === 'claude') {
    if (d === 'credenciales') {
      return { permitido: false, sensibilidad: s, porQue: 'las credenciales no viajan a ningún proveedor, tampoco a Claude' }
    }
    return { permitido: true, sensibilidad: s, porQue: 'Claude es el proveedor de razonamiento que el OS ya tiene en producción' }
  }

  if (s === SENSIBILIDAD.RESTRICTED) {
    return { permitido: false, sensibilidad: s, porQue: `«${dominio}» es RESTRICTED: no sale hacia un proveedor externo nuevo` }
  }

  if (proveedor === 'huggingface' || proveedor === 'hf') {
    if (nivel <= ORDEN.indexOf(SENSIBILIDAD.INTERNAL)) {
      return { permitido: true, sensibilidad: s, porQue: `«${dominio}» es ${s}: puede procesarse afuera` }
    }
    if (permitidoExplicitamente) {
      return { permitido: true, sensibilidad: s, porQue: `«${dominio}» es ${s} y el dueño lo autorizó para este caso` }
    }
    return { permitido: false, sensibilidad: s, porQue: `«${dominio}» es ${s} y Hugging Face remoto no está autorizado para ese nivel — corre local o no corre` }
  }

  return { permitido: false, sensibilidad: s, porQue: `proveedor desconocido: «${proveedor}»` }
}

/** Los métodos de la escalera que este dominio tiene permitidos, en orden. Es lo que el router usa
 *  para no siquiera intentar un camino prohibido. */
export function metodosPermitidos(dominio, { permitidoExplicitamente = false } = {}) {
  const hf = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente }).permitido
  const claude = puedeSalir(dominio, 'anthropic').permitido
  return { hfRemoto: hf, claude }
}
