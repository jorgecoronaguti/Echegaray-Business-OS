// LA ÚNICA LLAMADA A UN MODELO DE TODO ESTE MÓDULO.
//
// Leer una foto de una factura es visión: no hay forma determinística de hacerlo, y por eso acá sí
// se llama a la API. Está en un archivo aparte de `lectura.mjs` —que es puro— para que el permiso
// termine EXACTAMENTE acá: la puerta de permisos, el agrupado, la idempotencia y la escritura no
// pueden alcanzar este archivo ni por un import transitivo, y hay un test que lo verifica
// (`comunicacion/comprobantes/cero-modelo.test.mjs`).
//
// UNA llamada por adjunto, `temperature: 0`, modelo barato: es extracción, no razonamiento.

/** Modelo de visión. Barato a propósito: leer un ticket es extracción, no razonamiento. */
export const MODELO_LECTURA = process.env.ORQ_COMPROBANTES_MODELO || 'claude-haiku-4-5-20251001'

/**
 * Bloque de contenido para la API de Anthropic. Imagen → `image`; PDF → `document`.
 * Devuelve null para lo que no se puede mirar (un .docx, un audio): se avisa, no se adivina.
 */
export function bloqueAdjunto({ data, mediaType } = {}) {
  if (!data || !mediaType) return null
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  if (/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
  }
  return null
}

/**
 * EL PROMPT. Corto y cerrado: se le pide extraer, no interpretar.
 *
 * Las tres instrucciones que están acá por un defecto real y no por prolijidad:
 *   · el TOTAL es obligatorio (sin él la percepción se pierde, ver arriba);
 *   · el IVA va DISCRIMINADO por alícuota, porque 21% y 10,5% conviven en una misma factura y
 *     sumarlos en la lectura impide después controlarlos contra ARCA;
 *   · la ANOTACIÓN MANUSCRITA se transcribe tal cual, sin decidir qué significa. La obra la decide
 *     el matcheo contra el desplegable estricto, no el modelo.
 */
export const PROMPT_LECTURA = [
  'Sos un asistente administrativo de una constructora argentina. Mirá el comprobante de compra y',
  'extraé SÓLO lo que se ve. Nunca completes un dato que no esté impreso o escrito en el papel.',
  '',
  'Formato de números: es-AR. El punto separa miles y la coma es el decimal ("28.479,30").',
  'Copiá los importes TAL COMO ESTÁN IMPRESOS, con su punto y su coma. No los conviertas.',
  'Las fechas, en DD/MM/AAAA.',
  '',
  'Reglas:',
  '· El TOTAL es obligatorio: es el número más grande y prominente, el que tiene que cerrar con la',
  '  plata que salió. Si no se lee, poné legible=false y decilo en "dudas".',
  '· El IVA va DISCRIMINADO por alícuota: iva_21 y iva_105 por separado. Si la factura no discrimina',
  '  IVA (una factura B o C, un ticket), poné 0 en las dos.',
  '· Percepciones (IIBB, SUSS), impuestos internos y otros tributos van juntos en otros_tributos.',
  '· Si es NOTA DE CRÉDITO poné es_nota_credito=true. No cambies el signo de los importes: copialos',
  '  positivos tal como figuran.',
  '· Transcribí cualquier ANOTACIÓN MANUSCRITA tal cual, sin interpretarla.',
  '',
  'Respondé SÓLO este JSON, sin texto alrededor:',
  '{"emisor":"<razón social>","cuit":"<11 dígitos o null>","letra":"<A|B|C|null>",',
  '"es_nota_credito":<true|false>,"numero":"<0000-00000000 o null>","fecha":"<DD/MM/AAAA o null>",',
  '"neto_gravado":"<importe o null>","iva_21":"<importe o null>","iva_105":"<importe o null>",',
  '"otros_tributos":"<importe o null>","total":"<importe o null>",',
  '"condicion_venta":"<Contado|Cuenta Corriente|null>","forma_pago":"<lo que diga, o null>",',
  '"concepto":"<qué se compró, en pocas palabras>","anotacion_manuscrita":"<tal cual, o null>",',
  '"legible":<true|false>,"dudas":["<qué no pudiste leer>"]}',
].join('\n')

/**
 * Lee UN adjunto con el modelo de visión. UNA llamada por comprobante, `temperature: 0`.
 *
 * Falla devolviendo `{error}` y nunca lanza: un adjunto ilegible no puede tumbar el fajo entero —
 * los otros tres comprobantes de la misma foto se cargan igual y éste se reporta.
 *
 * @param {{data:string, mediaType:string, nombre?:string}} adjunto  base64 + tipo
 * @param {{apiKey?:string, fetchImpl?:Function, modelo?:string, maxTokens?:number}} [ctx]
 * @returns {Promise<{ok:true, crudo:object}|{ok:false, error:string}>}
 */
export async function leerAdjunto(adjunto, ctx = {}) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
    fetchImpl = globalThis.fetch,
    modelo = MODELO_LECTURA,
    maxTokens = 800,
  } = ctx
  const bloque = bloqueAdjunto(adjunto)
  if (!bloque) return { ok: false, error: `no puedo mirar un archivo ${adjunto?.mediaType ?? 'sin tipo'}` }
  if (!apiKey || typeof fetchImpl !== 'function') return { ok: false, error: 'no hay lectura de comprobantes disponible ahora' }

  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: [bloque, { type: 'text', text: PROMPT_LECTURA }] }],
      }),
    })
    if (!res.ok) return { ok: false, error: `la lectura del comprobante falló (${res.status})` }
    const j = await res.json()
    const texto = (j?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
    const m = String(texto ?? '').match(/\{[\s\S]*\}/)
    if (!m) return { ok: false, error: 'no pude interpretar el comprobante' }
    return { ok: true, crudo: JSON.parse(m[0]) }
  } catch (e) {
    return { ok: false, error: `no pude leer el comprobante: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}
