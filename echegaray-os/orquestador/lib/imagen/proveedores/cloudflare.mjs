// CLOUDFLARE WORKERS AI — el generador gratis de verdad, cuando exista la cuenta.
//
// ═══ POR QUÉ ESTE Y NO VERTEX ═══
//
// Vertex AI (el proveedor «bueno» que el OS ya podía usar con su propia credencial) se cobra por
// imagen y exige facturación activa. El dueño lo descartó por eso, textual: *"esa no porque es
// paga"*. Workers AI tiene un tramo gratuito diario y no pide tarjeta para empezar: es la única
// opción que cumple las dos condiciones —calidad usable y costo cero— al mismo tiempo.
//
// ═══ CÓMO ENTRA (27/08/2026) ═══
//
// El dueño autorizó la identidad UNA vez, por el flujo de dispositivo de Wrangler. De ahí sale un
// token que vence en una hora y se renueva solo: la renovación vive en `cloudflare-credencial.mjs`,
// que además prefiere `CLOUDFLARE_API_TOKEN` si algún día existe un token de servicio de verdad.
// El `CLOUDFLARE_ACCOUNT_ID` sí es una variable de entorno común: no es un secreto, es una dirección.
//
// ═══ LOS DOS DIALECTOS DE RESPUESTA ═══
//
// Workers AI no contesta igual según el modelo: FLUX devuelve JSON con la imagen en base64 dentro de
// `result.image`, y los Stable Diffusion devuelven los BYTES del PNG directo. Un adapter que asuma
// uno solo funciona hasta que alguien cambia el modelo por env — y falla con «respuesta inválida»,
// que no dice nada. Se soportan los dos y se decide por el `content-type`.

import { tokenCloudflare } from './cloudflare-credencial.mjs'

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

/** FLUX schnell: rápido, dentro del tramo gratuito y el mejor de los gratis para fotografía. */
const MODELO_POR_DEFECTO = '@cf/black-forest-labs/flux-1-schnell'

/** Los pasos de difusión. 4 es lo que schnell necesita —está entrenado para eso— y más pasos no
 *  mejoran: gastan cuota. PURA. */
const PASOS = 4

export function urlDeModelo(cuenta, modelo) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cuenta)}/ai/run/${modelo}`
}

/**
 * ¿ESTE MODELO ACEPTA QUE LE PIDAN LA MEDIDA?
 *
 * FLUX schnell NO: mandarle `width`/`height` devuelve `400 · Additional or unevaluated properties
 * '/width, /height' at '/' not allowed` y la generación entera se cae — probado el 27/08. Sale
 * siempre 1024×1024. Los Stable Diffusion sí las aceptan. Un adapter que manda los mismos campos a
 * todos funciona hasta que alguien cambia el modelo, y falla con un 400 que no dice qué sobra. PURA.
 */
export function aceptaMedida(modelo) {
  return !/flux/i.test(String(modelo ?? ''))
}

/** El cuerpo del pedido. Separado y PURO: es lo único que hay que mirar cuando la imagen sale
 *  distinta de lo pedido. */
export function cuerpoDe({ prompt, negativo = null, aspecto = '16:9', modelo = MODELO_POR_DEFECTO } = {}) {
  const cuerpo = { prompt: String(prompt ?? '').slice(0, 2048), steps: PASOS }
  if (aceptaMedida(modelo)) Object.assign(cuerpo, medidaDe(aspecto))
  if (negativo) cuerpo.negative_prompt = String(negativo).slice(0, 1024)
  return cuerpo
}

/** Aspecto → píxeles. Workers AI acepta hasta 1024 de lado. PURA. */
export function medidaDe(aspecto) {
  return {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1024, height: 576 },
    '9:16': { width: 576, height: 1024 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  }[String(aspecto)] || { width: 1024, height: 1024 }
}

export const imagenCloudflare = {
  nombre: 'cloudflare-workers-ai',

  // La cuenta se declara por entorno; el token puede venir del entorno O de la credencial que dejó
  // el login del dueño. Que `configurado()` no consulte el disco es a propósito: es síncrona y la
  // llama el cliente en la fila de proveedores. Si la credencial no está, `generar` lo dice.
  configurado() {
    return Boolean(env('CLOUDFLARE_ACCOUNT_ID'))
  },

  modelo() { return env('CLOUDFLARE_MODELO_IMAGEN', MODELO_POR_DEFECTO) },

  async generar({ prompt, negativo = null, aspecto = '16:9', fetchImpl = globalThis.fetch, señal } = {}) {
    const cuenta = env('CLOUDFLARE_ACCOUNT_ID')
    const clave = await tokenCloudflare({ fetchImpl })
    if (!cuenta || !clave) {
      const err = new Error(`${imagenCloudflare.nombre}: sin credencial`)
      err.status = 401
      err.falta = 'credencial'
      throw err
    }
    const modelo = imagenCloudflare.modelo()
    const res = await fetchImpl(urlDeModelo(cuenta, modelo), {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoDe({ prompt, negativo, aspecto, modelo })),
      signal: señal,
    })

    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      const err = new Error(`${imagenCloudflare.nombre}: HTTP ${res.status} ${detalle.slice(0, 300)}`)
      err.status = res.status
      // Se distingue el modo de falla porque cada uno tiene una acción distinta: un 401 es un token
      // mal puesto, un 429 es cuota del día, y un 404 casi siempre es un nombre de modelo viejo.
      err.falta = res.status === 401 || res.status === 403 ? 'credencial'
        : res.status === 429 ? 'cuota'
          : res.status === 404 ? 'modelo' : 'proveedor'
      throw err
    }

    const tipo = String(res.headers?.get?.('content-type') ?? '').split(';')[0].trim()
    if (tipo.startsWith('image/')) {
      const bytes = Buffer.from(await res.arrayBuffer())
      return { proveedor: imagenCloudflare.nombre, modelo, imagenes: [{ base64: bytes.toString('base64'), mime: tipo }] }
    }

    const j = await res.json()
    const b64 = j?.result?.image
    if (!b64) {
      const err = new Error(`${imagenCloudflare.nombre}: la respuesta no trae imagen (${JSON.stringify(j?.errors ?? j).slice(0, 200)})`)
      err.falta = 'proveedor'
      throw err
    }
    return { proveedor: imagenCloudflare.nombre, modelo, imagenes: [{ base64: b64, mime: 'image/jpeg' }] }
  },
}
