// LA PUERTA ÚNICA DEL OS HACIA UN GENERADOR DE IMÁGENES.
//
// Mismo diseño que `lib/ia/cliente.mjs` y por la misma razón: quien pide declara QUÉ imagen
// necesita, nunca un proveedor ni un modelo. El ORDEN de preferencia es la política y vive acá, no
// en cada caller; cambiar de proveedor no toca una línea de la tool ni de la skill.
//
// PROVEEDORES = [vertex, compatible]. El segundo es el fallback y hoy está apagado: sin
// `ORQ_IMG_ALT_BASE_URL` + `ORQ_IMG_ALT_API_KEY` se salta como si no existiera.
//
// ═══ LA CREDENCIAL DE GOOGLE SE LEE ACÁ, NO EN EL ADAPTER ═══
//
// El adapter recibe un token ya emitido y por eso se testea sin secretos. La emisión vive en este
// archivo porque es la misma credencial que ya usa todo el OS (`GOOGLE_SA_KEY_PATH` o el JSON por
// entorno, exactamente los dos caminos de `lib/google.mjs`) — sólo cambia el scope: Vertex necesita
// `cloud-platform`, que Drive no pide.
//
// ═══ SIN PROVEEDOR NO SE INVENTA UNA IMAGEN ═══
//
// Cuando ninguno puede, esto NO devuelve un placeholder ni una imagen de archivo: devuelve el error
// con `falta` y `que_hacer` puestos. Un placeholder que se ve como imagen es exactamente el defecto
// que la regla de procedencia existe para evitar.

import { imagenCompatible } from './proveedores/compatible.mjs'
import { imagenAbierta } from './proveedores/abierto.mjs'
import { imagenCloudflare } from './proveedores/cloudflare.mjs'
import { SCOPE_VERTEX, proyectoDe, vertexImagen } from './proveedores/vertex-imagen.mjs'

// EL ORDEN ES LA POLÍTICA, y la política la fijó el dueño: calidad usable a costo cero.
//
//   1. CLOUDFLARE WORKERS AI — tramo gratuito diario y calidad de FLUX. Primero porque cumple las
//      dos condiciones. Apagado hasta que existan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN.
//   2. VERTEX — el OS ya tiene la credencial, pero se cobra por imagen: el dueño lo descartó por eso.
//      Queda en la fila para el día que haga falta calidad y el costo no importe.
//   3. COMPATIBLE — si alguna vez se contrata un proveedor del dialecto OpenAI.
//   4. ABIERTO — sin credencial, gratis, y de calidad claramente menor (medido). Último a propósito:
//      existe para que la capacidad RESPONDA, no para que responda bien.
export const PROVEEDORES = [imagenCloudflare, vertexImagen, imagenCompatible, imagenAbierta]

/** Lee el JSON del service account por los MISMOS dos caminos que `lib/google.mjs`: el env
 *  (entornos sin disco) y el archivo (la VM). Devuelve `{credencial, keyFile}` o `{}`. */
async function credencialGoogle(config = {}) {
  const { credencialDelEntorno, resolveKeyPath } = await import('../google.mjs')
  const porEnv = credencialDelEntorno()
  if (porEnv) return { credencial: porEnv, keyFile: null }
  const keyFile = resolveKeyPath(config)
  try {
    const { readFile } = await import('node:fs/promises')
    return { credencial: JSON.parse(await readFile(keyFile, 'utf8')), keyFile }
  } catch { return {} }
}

/** Access token con scope `cloud-platform`. Separado para poder inyectarlo en los tests. */
export async function tokenVertex({ credencial, keyFile } = {}) {
  const { GoogleAuth } = await import('google-auth-library')
  const ga = credencial && !keyFile
    ? new GoogleAuth({ credentials: credencial, scopes: [SCOPE_VERTEX] })
    : new GoogleAuth({ keyFile, scopes: [SCOPE_VERTEX] })
  const cliente = await ga.getClient()
  return (await cliente.getAccessToken())?.token ?? null
}

/**
 * QUÉ FALTA, DICHO PARA QUE SE PUEDA ACCIONAR. Es el valor de esta función: un «no se pudo generar»
 * obliga a investigar de nuevo cada vez; esto nombra la acción concreta y quién la hace. PURA.
 */
export function queHacer(falta) {
  return {
    habilitar_api: 'Habilitar aiplatform.googleapis.com en el proyecto de Google Cloud del OS y activar facturación. Lo hace el dueño en la consola, una vez.',
    permiso_vertex: 'Darle el rol roles/aiplatform.user al service account del OS en el proyecto de Google Cloud.',
    credencial: 'La credencial de Google del OS no está disponible en este proceso (GOOGLE_SA_KEY_PATH o el JSON por entorno).',
    proyecto: 'No se conoce el proyecto de Google Cloud: definir ORQ_VERTEX_PROJECT o usar un key de service account que traiga project_id.',
    modelo: 'Revisar ORQ_VERTEX_MODELO_IMAGEN y ORQ_VERTEX_REGION: el modelo pedido no existe en esa región.',
    contenido_bloqueado: 'El proveedor bloqueó el prompt por su filtro de contenido. Reformular el pedido.',
    sin_proveedor: 'No hay ningún generador de imágenes disponible. El principal es Vertex AI con el service account que ya existe; el alternativo se enciende con ORQ_IMG_ALT_BASE_URL + ORQ_IMG_ALT_API_KEY; el abierto está encendido salvo ORQ_IMG_ABIERTO=off.',
    cuota: 'El generador abierto llegó a su límite de pedidos. Reintentar más tarde, o configurar un proveedor con credencial.',
    proveedor: 'El generador abierto no devolvió una imagen usable. Reintentar, o configurar un proveedor con credencial.',
    prompt: 'El pedido llegó sin descripción de la imagen.',
  }[falta] ?? 'Revisar el detalle del error del proveedor.'
}

/**
 * PEDIR UNA IMAGEN. La única forma correcta de hacerlo en todo el OS.
 *
 * @returns {{ok:true, base64, mime, proveedor, modelo, fallbackDe, ms}}
 *        | {{ok:false, falta, motivo, que_hacer, proveedor, intentos:[...]}}
 *
 * NO lanza: quien la usa siempre tiene que poder contarle al dueño qué pasó, y una excepción que
 * sube hasta el gateway se convierte en «hubo un error» sin nombre.
 */
export async function generarImagen({
  prompt, negativo = null, aspecto = '16:9', config = {}, fetchImpl = globalThis.fetch, señal,
  proveedores = PROVEEDORES, obtenerToken = tokenVertex,
} = {}) {
  const t0 = Date.now()
  const intentos = []
  let fallbackDe = null

  for (const proveedor of proveedores) {
    const esVertex = proveedor.nombre === vertexImagen.nombre
    let token = null
    let proyecto = null

    if (esVertex) {
      const { credencial, keyFile } = await credencialGoogle(config)
      proyecto = proyectoDe({ config, credencial })
      if (!proveedor.configurado({ credencial, config })) {
        intentos.push({ proveedor: proveedor.nombre, falta: credencial ? 'proyecto' : 'credencial', motivo: 'no configurado' })
        fallbackDe = proveedor.nombre
        continue
      }
      try { token = await obtenerToken({ credencial, keyFile }) }
      catch (e) {
        intentos.push({ proveedor: proveedor.nombre, falta: 'credencial', motivo: String(e?.message ?? e).slice(0, 200) })
        fallbackDe = proveedor.nombre
        continue
      }
    } else if (!proveedor.configurado()) {
      intentos.push({ proveedor: proveedor.nombre, falta: 'credencial', motivo: 'no configurado' })
      continue
    }

    try {
      const r = await proveedor.generar({ prompt, negativo, aspecto, proyecto, token, fetchImpl, señal })
      const primera = r.imagenes[0]
      return {
        ok: true, base64: primera.base64, mime: primera.mime,
        proveedor: r.proveedor, modelo: r.modelo, fallbackDe, ms: Date.now() - t0, intentos,
      }
    } catch (e) {
      intentos.push({ proveedor: proveedor.nombre, falta: e?.falta ?? null, status: e?.status ?? null, motivo: String(e?.message ?? e).slice(0, 400) })
      fallbackDe = proveedor.nombre
    }
  }

  // El primer intento es el que explica de verdad: el fallback apagado dice «sin credencial», que
  // describe al fallback, no a la falla. Misma lección que `lib/ia/cliente.mjs`.
  const principal = intentos[0] ?? { falta: 'sin_proveedor', motivo: 'ningún generador configurado' }
  const falta = principal.falta ?? 'sin_proveedor'
  return {
    ok: false, falta,
    motivo: principal.motivo,
    que_hacer: queHacer(falta),
    proveedor: principal.proveedor ?? null,
    intentos, ms: Date.now() - t0,
  }
}
