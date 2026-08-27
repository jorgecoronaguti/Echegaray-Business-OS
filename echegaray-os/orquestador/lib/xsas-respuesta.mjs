// LA RESPUESTA QUE SALE DE XSAS — una sola forma para todas las caras.
//
// La app pinta tarjetas, Mattermost pinta markdown y un worker guarda el resultado. Las tres cosas
// se pueden hacer con la MISMA respuesta si trae, separados, el texto y los datos. Cuando cada cara
// inventa su formato, agregar una capacidad obliga a tocar tres renderers.
//
// Lo que sí es obligatorio y no decorativo:
//   · `estado` distingue ok / degradado / error. Degradado NO es ok: es una respuesta con una
//     limitación que quien la lee tiene que ver.
//   · `llm` dice si se pagó un modelo y CUÁL respondió de verdad (no cuál se pidió).
//   · `capacidades` dice con qué se resolvió: nivel, skills y tools. Es lo que hace auditable que
//     una consulta de lookup no haya pasado por un modelo.
//   · `correlationId` viaja en TODAS, incluso en el error: sin él un fallo no se puede seguir.

export const ESTADO = Object.freeze({ OK: 'ok', DEGRADADO: 'degradado', ERROR: 'error' })

/** El molde. Todos los campos existen siempre — un consumidor no tiene que preguntar si están. */
function base(pedido) {
  return {
    ok: false,
    estado: ESTADO.ERROR,
    correlationId: pedido?.correlationId ?? null,
    requestId: pedido?.requestId ?? null,
    canal: pedido?.canal ?? null,
    respuesta: null,
    datos: null,
    acciones: { posibles: [], ejecutadas: [] },
    links: [],
    evidencia: [],
    capacidades: { nivel: null, skills: [], tools: [], via: null, confianza: null, motivo: null },
    llm: null,
    degradacion: null,
    error: null,
    ms: 0,
  }
}

/**
 * @param {object} pedido
 * @param {object} p
 * @param {string} [p.respuesta]  el texto para una persona
 * @param {unknown} [p.datos]     el resultado para un programa
 * @param {object} [p.capacidades] {nivel, skills, tools, via, confianza, motivo}
 * @param {object} [p.llm]        {proveedor, modelo, tokens, usd, intentos, fallbackDe, ms}
 * @param {string} [p.degradacion] si viene, el estado es DEGRADADO aunque haya respuesta
 */
export function respuestaOk(pedido, p = {}) {
  const r = base(pedido)
  r.ok = true
  r.estado = p.degradacion ? ESTADO.DEGRADADO : ESTADO.OK
  r.respuesta = p.respuesta ?? null
  r.datos = p.datos ?? null
  r.acciones = { posibles: p.accionesPosibles ?? [], ejecutadas: p.accionesEjecutadas ?? [] }
  r.links = p.links ?? []
  r.evidencia = p.evidencia ?? []
  r.capacidades = { ...r.capacidades, ...(p.capacidades ?? {}) }
  r.llm = p.llm ?? null
  r.degradacion = p.degradacion ?? null
  r.ms = p.ms ?? 0
  return r
}

/** Un fallo. NUNCA lanza hacia el caller: el gateway devuelve el error como dato, con su id. */
export function respuestaError(pedido, { tipo = 'error', mensaje = 'error', ms = 0, capacidades = null } = {}) {
  const r = base(pedido)
  r.error = { tipo, mensaje: String(mensaje).slice(0, 500) }
  r.respuesta = String(mensaje).slice(0, 500)
  if (capacidades) r.capacidades = { ...r.capacidades, ...capacidades }
  r.ms = ms
  return r
}

/** ¿Esta respuesta pagó un modelo? Lo pregunta la traza y lo prueban los tests sin-LLM. */
export function usoLlm(r) {
  return Boolean(r?.llm?.modelo)
}
