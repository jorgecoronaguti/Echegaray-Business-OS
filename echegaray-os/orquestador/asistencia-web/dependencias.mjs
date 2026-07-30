// INYECCIÓN DE DEPENDENCIAS — el cable entre este frente y los otros dos.
//
// `asistencia-motivos.mjs` y `jornada-config.mjs` (frente A) y `enlace-firmado.mjs`
// (frente C) se construyen en paralelo a esta pantalla. Este archivo programa contra la
// INTERFAZ congelada del contrato y resuelve el módulo real de forma perezosa, así:
//
//   · los tests corren con dobles, sin esperar a nadie;
//   · la integración final es un `import()` que empieza a resolver, no un merge;
//   · si el módulo todavía no existe, el servidor lo dice con una frase entendible en vez
//     de tirar un stack de resolución de módulos en la cara del jefe de obra.
//
// Nada de esto inventa el comportamiento del otro frente: si falta `validarNovedad`, NO
// se valida "más o menos" — se rechaza el registro. Un motivo que no se validó es un dato
// fabricado, y eso está prohibido.

const FALTA_MOTIVOS = 'El catálogo de motivos todavía no está disponible en el sistema.'
const FALTA_ENLACE = 'El acceso por enlace todavía no está habilitado.'

/** Carga perezosa con memo del resultado (incluido el fallo: no se reintenta por pedido). */
function perezoso(cargar) {
  let p = null
  return () => (p ??= cargar().then((m) => ({ ok: true, m }), (e) => ({ ok: false, e })))
}

const modMotivos = perezoso(() => import('../lib/asistencia-motivos.mjs'))
const modJornada = perezoso(() => import('../lib/jornada-config.mjs'))
const modEnlace = perezoso(() => import('../comunicacion/enlace-firmado.mjs'))

/**
 * Motivos (frente A). Si el módulo no está, `validarNovedad` rechaza con un mensaje claro
 * y `catalogo` viene vacío: la pantalla muestra que no puede registrar excepciones, no
 * inventa una lista.
 */
export async function dameMotivos(inyectado) {
  if (inyectado) return inyectado
  const r = await modMotivos()
  if (!r.ok) {
    return {
      disponible: false,
      CATALOGO: [],
      motivosPara: () => [],
      validarNovedad: () => ({ ok: false, error: FALTA_MOTIVOS }),
    }
  }
  return { disponible: true, ...r.m }
}

/**
 * Jornada por configuración (frente A). Ante cualquier problema —módulo ausente, base
 * caída— devuelve `sin_config`, que es la respuesta honesta: manda la calibración desde
 * la planilla, que ya es la fuente de verdad. Nunca inventa un número.
 */
export async function dameJornadaConfig(inyectado) {
  if (inyectado) return inyectado
  const r = await modJornada()
  if (!r.ok) return async () => ({ horas: null, origen: 'sin_config' })
  return async (port, opts) => {
    try {
      return await r.m.jornadaConfigurada(port, opts)
    } catch {
      return { horas: null, origen: 'sin_config' }
    }
  }
}

/** Verificación del enlace de un solo uso (frente C). */
export async function dameEnlace(inyectado) {
  if (inyectado) return inyectado
  const r = await modEnlace()
  if (!r.ok) return { verificarEnlace: () => ({ ok: false, motivo: 'invalido', detalle: FALTA_ENLACE }) }
  return r.m
}
