// LA ÚNICA LLAMADA A UN MODELO DE TODO ESTE MÓDULO.
//
// Leer una foto de una factura es visión: no hay forma determinística de hacerlo, y por eso acá sí
// se llama a la API. Está en un archivo aparte de `lectura.mjs` —que es puro— para que el permiso
// termine EXACTAMENTE acá: la puerta de permisos, el agrupado, la idempotencia y la escritura no
// pueden alcanzar este archivo ni por un import transitivo, y hay un test que lo verifica
// (`comunicacion/comprobantes/cero-modelo.test.mjs`).
//
// ═══ UNA LECTURA BARATA, Y UN SEGUNDO PAR DE OJOS SÓLO CUANDO LA PRIMERA DUDÓ (03/08) ═══
//
// Medido sobre la foto real que falló (IMG_7530.jpg, un ticket de Corralón fotografiado ACOSTADO):
// el modelo barato leyó el número `0004-00036542` en vez de `0004-00003642`, no vio la anotación
// manuscrita "Messinas BSA" —que es la obra— y copió el total en el lugar del neto. Con el prompt
// corregido siguió sin verla. El modelo grande, con el mismo prompt, leyó bien el número y vio la
// anotación.
//
// La respuesta NO es pagar el modelo grande en cada foto: la mayoría de los comprobantes se leen
// bien y barato. La respuesta es una ESCALERA con un disparador DETERMINÍSTICO —`necesitaRevision`,
// que no consulta a nadie: mira si el total falta, si la aritmética no cierra, si el comprobante se
// declaró ilegible o si no apareció ninguna anotación manuscrita—. Cuando la primera lectura duda,
// y sólo entonces, se pide la segunda.
//
// Y las dos lecturas se FUSIONAN campo por campo, no se reemplaza una por la otra: en la medición el
// modelo grande acertó el número y la anotación, y el chico acertó el nombre del proveedor. Tirar la
// primera lectura entera habría cambiado un defecto por otro.

import { aNumero, redondear2 } from '../carga-comprobantes.mjs'

/** Modelo de lectura. Barato a propósito: leer un ticket es extracción, no razonamiento. */
export const MODELO_LECTURA = process.env.ORQ_COMPROBANTES_MODELO || 'claude-haiku-4-5-20251001'

/** Modelo de REVISIÓN. Sólo se usa cuando la primera lectura dudó. */
export const MODELO_REVISION = process.env.ORQ_COMPROBANTES_MODELO_REVISION || 'claude-sonnet-4-5-20250929'

/** Diferencia tolerada al chequear que neto + IVA + otros tributos cierren con el total. */
const TOLERANCIA = 0.5

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
 * Cada bloque está acá por un defecto REAL medido contra la foto que falló, no por prolijidad:
 *
 *   · LA FOTO VIENE GIRADA. El ticket que falló estaba acostado 90°: el modelo leía un dígito de
 *     más. Decirle que la gire mentalmente y que recorra los cuatro márgenes cambia lo que mira.
 *   · LO MANUSCRITO ES LA OBRA. Va PRIMERO y con su porqué, no como un renglón al final. Es el dato
 *     más importante de la empresa y el único que nunca viene impreso.
 *   · SE TRANSCRIBE, NO SE INTERPRETA. La obra la decide el matcheo contra el desplegable estricto
 *     (`imputacion.mjs`), nunca el modelo. Un modelo que elige la obra imputa plata por su cuenta.
 *   · NO SE INVENTA PARA NO DEJAR UN NULL. Se probó una versión que exigía "nunca devuelvas null si
 *     hay tinta manuscrita" y el modelo empezó a FABRICAR importes ($62.049,32 donde decía
 *     $62.000,00). Un null es una pregunta; un número inventado es una carga mal hecha. Por eso el
 *     prompt dice explícitamente que dudar está permitido.
 *   · EL COMPROBANTE TRAE DOS CUIT. El del emisor y el de Echegaray, que es el comprador. El modelo
 *     devolvía el del comprador como emisor.
 *   · EL TOTAL Y EL NETO. Sin el total, la percepción de IIBB/SUSS se pierde (M = Total − IVA); y el
 *     modelo copiaba el total en el lugar del neto, lo que hacía que nada cerrara.
 *   · EL CAE. 14 dígitos, y es la clave más fuerte que existe para conciliar contra ARCA.
 */
export const PROMPT_LECTURA = [
  'Sos un asistente administrativo de una constructora argentina. Mirá el comprobante de compra y',
  'extraé SÓLO lo que se ve. Nunca completes un dato que no esté impreso o escrito en el papel.',
  '',
  'LA FOTO PUEDE VENIR GIRADA (90°, 180° o torcida) y el papel puede estar arrugado o doblado.',
  'Giralá mentalmente y leela igual: un ticket acostado se lee de abajo hacia arriba. Antes de',
  'contestar recorré los CUATRO márgenes de la hoja, no sólo el bloque impreso del centro.',
  '',
  'LO ESCRITO A MANO ES EL DATO MÁS IMPORTANTE DE ESTE TRABAJO.',
  'En esta empresa alguien anota A MANO, sobre el comprobante, la obra o el cliente al que va el',
  'gasto. Es lo único que nunca viene impreso, porque el proveedor no sabe a qué obra se imputa.',
  'Suele estar arriba a la izquierda, pero puede estar en cualquier margen, torcido, con birome, en',
  'otro sentido que el texto impreso o al lado del logo. Buscalo SIEMPRE.',
  'Transcribilo TAL CUAL, letra por letra, sin corregirlo ni interpretarlo: si está en plural va en',
  'plural, si está abreviado va abreviado. NO decidas a qué obra corresponde — eso lo resuelve otro',
  'paso contra la lista oficial. Si hay varias anotaciones, ponelas todas separadas por " · ".',
  'Si de verdad no hay nada escrito a mano, poné null: es una respuesta válida.',
  '',
  'DUDAR ESTÁ PERMITIDO; INVENTAR NO. Si un dato no se lee, poné null y explicalo en "dudas".',
  'Nunca completes un importe, un número ni una letra "para que quede algo": un dato inventado se',
  'convierte en plata mal cargada, y un null se convierte en una pregunta que alguien contesta.',
  '',
  'Formato de números: es-AR. El punto separa miles y la coma es el decimal ("28.479,30").',
  'Copiá los importes TAL COMO ESTÁN IMPRESOS, con su punto y su coma. No los conviertas.',
  'Las fechas, en DD/MM/AAAA.',
  '',
  'Reglas:',
  '· El NÚMERO DE COMPROBANTE se copia DÍGITO POR DÍGITO. Tiene la forma 0000-00000000: cuatro',
  '  dígitos de punto de venta, guion, y OCHO dígitos de correlativo. Contá los ceros del medio y',
  '  verificá que después del guion haya exactamente ocho dígitos. Un dígito de más convierte esta',
  '  factura en otra distinta.',
  '· El EMISOR es quien VENDE: el proveedor, arriba del todo, con su logo. El comprobante también',
  '  trae el CUIT del COMPRADOR, que es ECHEGARAY CONSTRUCCIONES S.A.S.: ése NO es el emisor y nunca',
  '  va en "cuit". Si ves dos CUIT, el del emisor es el que NO es Echegaray.',
  '· El TOTAL es obligatorio: es el número más grande y prominente, el que tiene que cerrar con la',
  '  plata que salió. Si no se lee, poné legible=false y decilo en "dudas".',
  '· NETO GRAVADO es el subtotal SIN IVA (aparece como "ST1", "Subtotal" o "Neto"). Tiene que cumplir',
  '  neto + IVA + otros tributos = total. Si lo que anotaste no cierra, volvé a mirar: lo más común',
  '  es haber copiado el total en el lugar del neto.',
  '· El IVA va DISCRIMINADO por alícuota: iva_21 y iva_105 por separado. Si la factura no discrimina',
  '  IVA (una factura B o C, un ticket), poné 0 en las dos.',
  '· Percepciones (IIBB, SUSS), impuestos internos y otros tributos van juntos en otros_tributos.',
  '· El CAE es el "Cód. Autorización Electrónico": 14 dígitos, abajo, cerca del código de barras o',
  '  del QR. Copialo entero si está; si no lo ves entero, poné null.',
  '· Si es NOTA DE CRÉDITO poné es_nota_credito=true. No cambies el signo de los importes: copialos',
  '  positivos tal como figuran.',
  '',
  'Respondé SÓLO este JSON, sin texto alrededor:',
  '{"emisor":"<razón social del que VENDE>","cuit":"<11 dígitos del emisor, o null>",',
  '"letra":"<A|B|C|null>","es_nota_credito":<true|false>,"numero":"<0000-00000000 o null>",',
  '"cae":"<14 dígitos o null>","fecha":"<DD/MM/AAAA o null>",',
  '"neto_gravado":"<importe o null>","iva_21":"<importe o null>","iva_105":"<importe o null>",',
  '"otros_tributos":"<importe o null>","total":"<importe o null>",',
  '"condicion_venta":"<Contado|Cuenta Corriente|null>","forma_pago":"<lo que diga, o null>",',
  '"concepto":"<QUÉ SE COMPRÓ: los artículos, en pocas palabras. Nunca la dirección ni el rubro',
  'del proveedor>","anotacion_manuscrita":"<tal cual, o null>",',
  '"legible":<true|false>,"dudas":["<qué no pudiste leer>"]}',
].join('\n')

const vacio = (v) => v == null || String(v).trim() === '' || /^(null|n\/a|-|—)$/i.test(String(v).trim())

/**
 * ¿Esta lectura merece un segundo par de ojos? DETERMINÍSTICO: no consulta a nadie.
 *
 * Los cuatro disparadores son los cuatro síntomas que tuvo la lectura que falló en producción.
 * El de la anotación es el más caro de los cuatro —la mayoría de los comprobantes no tienen nada
 * escrito— y está igual: la obra es el dato que decide a qué obra se le carga el costo, y no verla
 * cuando está es exactamente el defecto que se está arreglando.
 */
export function necesitaRevision(crudo = {}) {
  const motivos = []
  if (crudo?.legible === false) motivos.push('la lectura se declaró ilegible')
  if (vacio(crudo?.total)) motivos.push('no leyó el total')
  if (vacio(crudo?.numero)) motivos.push('no leyó el número')
  if (vacio(crudo?.fecha)) motivos.push('no leyó la fecha')
  const total = aNumero(crudo?.total)
  const neto = aNumero(crudo?.neto_gravado)
  if (total != null && neto != null) {
    const suma = neto + (aNumero(crudo?.iva_21) ?? 0) + (aNumero(crudo?.iva_105) ?? 0) + (aNumero(crudo?.otros_tributos) ?? 0)
    if (Math.abs(redondear2(suma - total)) > TOLERANCIA) motivos.push('neto + IVA no cierra con el total')
  }
  if (vacio(crudo?.anotacion_manuscrita)) motivos.push('no encontró ninguna anotación manuscrita')
  return motivos
}

/**
 * Fusiona la revisión sobre la primera lectura. Campo por campo, la revisión manda cuando dice algo.
 *
 * `emisor_alt` guarda el nombre que leyó la OTRA pasada. No es redundancia: en la medición real una
 * pasada leyó "Néstor Rubén Corralón Progreso" —que matchea el desplegable— y la otra "MATERIALES DE
 * CONSTRUCCION", que no. Quien decide cuál vale es el desplegable ESTRICTO de Compras, no el modelo,
 * y para eso necesita ver las dos.
 */
export function fusionar(primera = {}, revision = {}) {
  const out = { ...primera }
  for (const [k, v] of Object.entries(revision)) {
    if (k === 'dudas' || k === 'legible') continue
    if (!vacio(v)) out[k] = v
  }
  out.legible = primera?.legible !== false && revision?.legible !== false
  out.dudas = [...new Set([...(primera?.dudas ?? []), ...(revision?.dudas ?? [])].map((d) => String(d)))].slice(0, 6)
  const alt = [primera?.emisor, revision?.emisor].filter((e) => !vacio(e)).map((e) => String(e).trim())
  if (alt.length === 2 && alt[0] !== alt[1]) out.emisor_alt = alt.find((e) => e !== out.emisor) ?? null
  return out
}

/** Una sola llamada al modelo. Devuelve el JSON crudo o `{error}`; nunca lanza. */
async function unaLectura(bloque, { apiKey, fetchImpl, modelo, maxTokens }) {
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

/**
 * Lee UN adjunto con el modelo de visión, con revisión si la primera lectura dudó.
 *
 * Falla devolviendo `{error}` y nunca lanza: un adjunto ilegible no puede tumbar el fajo entero —
 * los otros tres comprobantes de la misma tanda se cargan igual y éste se reporta.
 *
 * Si la REVISIÓN falla (sin crédito, la API caída), se devuelve la primera lectura y se declara en
 * `revision.error`. Perder la segunda opinión no puede convertirse en no leer nada.
 *
 * @param {{data:string, mediaType:string, nombre?:string}} adjunto  base64 + tipo
 * @param {{apiKey?:string, fetchImpl?:Function, modelo?:string, modeloRevision?:string|null, maxTokens?:number}} [ctx]
 * @returns {Promise<{ok:true, crudo:object, revision?:object}|{ok:false, error:string}>}
 */
export async function leerAdjunto(adjunto, ctx = {}) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
    fetchImpl = globalThis.fetch,
    modelo = MODELO_LECTURA,
    modeloRevision = MODELO_REVISION,
    maxTokens = 1200,
  } = ctx
  const bloque = bloqueAdjunto(adjunto)
  if (!bloque) return { ok: false, error: `no puedo mirar un archivo ${adjunto?.mediaType ?? 'sin tipo'}` }
  if (!apiKey || typeof fetchImpl !== 'function') return { ok: false, error: 'no hay lectura de comprobantes disponible ahora' }

  const opciones = { apiKey, fetchImpl, modelo, maxTokens }
  const primera = await unaLectura(bloque, opciones)
  if (!primera.ok) return primera

  const motivos = necesitaRevision(primera.crudo)
  if (!motivos.length || !modeloRevision || modeloRevision === modelo) {
    return { ok: true, crudo: primera.crudo, revision: { hubo: false, motivos } }
  }

  const segunda = await unaLectura(bloque, { ...opciones, modelo: modeloRevision })
  if (!segunda.ok) {
    return { ok: true, crudo: primera.crudo, revision: { hubo: false, motivos, error: segunda.error } }
  }
  return {
    ok: true,
    crudo: fusionar(primera.crudo, segunda.crudo),
    revision: { hubo: true, motivos, modelo: modeloRevision },
  }
}
