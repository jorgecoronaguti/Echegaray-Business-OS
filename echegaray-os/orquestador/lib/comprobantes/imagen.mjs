// EL IPHONE DEL DUEÑO MANDA HEIC, Y HEIC SE TIRABA AL PISO SIN DECIR NADA.
//
// ═══ EL DEFECTO (13/08, medido en producción) ═══
//
// El dueño mandó al canal `Comprobantes-gastos` un PDF y **siete archivos `.HEIC`** (IMG_7572 …
// IMG_7578, 2,8–4,3 MB cada uno). El bot cargó 3 y de los otros no dijo una palabra. Dos causas:
//
//   · `MEDIA_SOPORTADOS` no incluía `image/heic` ni `image/heif`, así que `bajarAdjunto` los
//     rechazaba antes de bajarlos;
//   · y aunque los hubiera bajado, **la API de Anthropic tampoco acepta HEIC**: hay que convertirlos.
//
// HEIC es el formato POR DEFECTO de la cámara del iPhone. No es un caso borde: es el caso normal, y
// el dueño tuvo que reexportar las fotos a mano para volver a mandarlas. Textual: «pierdo tiempo,
// tengo q rehacer todo y reenviar».
//
// ═══ CON QUÉ SE CONVIERTE, Y POR QUÉ NO CON LO QUE YA HABÍA ═══
//
// Medido en esta máquina el 13/08:
//   · `heif-convert`, `magick`, `convert`, `vips`, `ffmpeg`: **no están instalados**.
//   · `python3` no tiene `pillow-heif`.
//   · `sharp` (transitiva de Next) SÍ está y su libvips 8.17.3 declara soporte `heif`, pero su
//     `input.fileSuffix` es **`['.avif']`**: el build empaquetado trae AV1, no HEVC. `heifsave` con
//     `compression:'hevc'` contesta `Unsupported compression`. Sirve para AVIF, no para el HEIC del
//     iPhone.
//   · `heic-convert@2.1.0` (JavaScript puro, 5 paquetes, sin binarios del sistema) convirtió un HEIC
//     real de 718 KB a JPEG de 415 KB en 460 ms. **Es el que se usa.**
//
// ═══ FALLA DECLARANDO, NUNCA EN SILENCIO ═══
//
// El convertidor entra por `import()` dinámico y su ausencia NO revienta nada: devuelve un motivo
// legible que termina impreso en el resumen del canal, con el nombre del archivo. Un adjunto que
// desaparece sin que nada lo nombre es exactamente lo que le hizo perder el tiempo al dueño: creyó
// que había mandado ocho y el bot contó tres.

/** Lo que hay que convertir antes de mirarlo. HEIC/HEIF salen de la cámara del iPhone. */
export const MEDIA_CONVERTIBLES = Object.freeze([
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
])

/** A qué se convierte. JPEG porque es lo que la API acepta y lo que menos pesa para una factura. */
export const MEDIA_DESTINO = 'image/jpeg'

/**
 * Lado largo máximo del JPEG que se manda a mirar.
 *
 * 1568 px es el lado al que la API reescala igual del otro lado: mandar 4032 px de un iPhone paga el
 * ancho de banda y no compra un solo píxel de lectura. Bajar de ahí sí costaría: el número de
 * comprobante son ocho dígitos chicos y ya se leyó mal una vez por un dígito.
 */
export const LADO_MAXIMO = 1568

/** Calidad del JPEG. 0,82 mantiene legible un tique térmico y deja el archivo bien por debajo del tope. */
export const CALIDAD = 0.82

/** Por qué un adjunto no se pudo preparar. Es lo que se le dice al dueño, con su archivo al lado. */
export const MOTIVO = Object.freeze({
  SIN_CONVERSOR: 'no tengo con qué convertir el HEIC del iPhone en este servidor — mandalo como JPG '
    + '(en el iPhone: Ajustes › Cámara › Formatos › "Más compatible") y lo cargo',
  FALLO: 'no pude convertir el HEIC a una imagen legible',
})

/** Carga perezosa del convertidor. Se resuelve una vez y se recuerda, incluso la ausencia. */
let convertidorPromesa = null
async function convertidorHeic() {
  if (!convertidorPromesa) {
    convertidorPromesa = import('heic-convert')
      .then((m) => m?.default ?? m)
      .catch(() => null)
  }
  return convertidorPromesa
}

/** Carga perezosa de sharp, que es TRANSITIVA (viene con Next) y por eso puede no estar. */
let sharpPromesa = null
async function sharpOpcional() {
  if (!sharpPromesa) sharpPromesa = import('sharp').then((m) => m?.default ?? m).catch(() => null)
  return sharpPromesa
}

/** ¿Este tipo hay que convertirlo antes de que un modelo pueda mirarlo? */
export function hayQueConvertir(mediaType) {
  return MEDIA_CONVERTIBLES.includes(String(mediaType ?? '').split(';')[0].trim().toLowerCase())
}

/**
 * Achica una imagen si su lado largo pasa de `LADO_MAXIMO`. Si sharp no está, devuelve lo que entró.
 * Nunca lanza: achicar es una optimización, no un requisito.
 */
export async function achicar(buffer, { lado = LADO_MAXIMO, sharpImpl = null } = {}) {
  const sharp = sharpImpl ?? await sharpOpcional()
  if (typeof sharp !== 'function') return buffer
  try {
    return await sharp(buffer)
      .rotate()  // respeta la orientación EXIF: una foto acostada ya se leyó mal una vez
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(CALIDAD * 100), mozjpeg: true })
      .toBuffer()
  } catch {
    return buffer
  }
}

/**
 * Un adjunto bajado → un adjunto que un modelo de visión PUEDE mirar.
 *
 * Lo que ya es mirable (JPEG, PNG, WEBP, GIF, PDF) pasa TAL CUAL: esta función no toca lo que anda.
 * Lo que hay que convertir se convierte y se declara en `convertidoDe`, para que el resumen pueda
 * decir «era HEIC y lo convertí» en vez de que el dueño no entienda por qué su foto tardó más.
 *
 * NUNCA LANZA. Devuelve `{ok:false, error}` con un motivo que se le puede leer a una persona.
 *
 * @param {{data:string, mediaType:string, nombre?:string, fileId?:string}} adjunto  `data` en base64
 * @param {{convertir?:Function, sharpImpl?:Function}} [ctx]  inyectables para los tests
 * @returns {Promise<{ok:true, data:string, mediaType:string, convertidoDe?:string, bytes:number}
 *                  |{ok:false, error:string}>}
 */
export async function prepararParaVision(adjunto = {}, ctx = {}) {
  const mediaType = String(adjunto.mediaType ?? '').split(';')[0].trim().toLowerCase()
  if (!hayQueConvertir(mediaType)) {
    return { ok: true, data: adjunto.data, mediaType, bytes: bytesDeBase64(adjunto.data) }
  }
  // `convertir: null` EXPLÍCITO es "no hay convertidor en este servidor", que es un caso que hay que
  // poder probar. Con `??` se caía al real y el test verificaba lo contrario de lo que decía.
  const convertir = ('convertir' in ctx) ? ctx.convertir : await convertidorHeic()
  if (typeof convertir !== 'function') return { ok: false, error: MOTIVO.SIN_CONVERSOR }
  try {
    const entrada = Buffer.from(String(adjunto.data ?? ''), 'base64')
    const jpeg = await convertir({ buffer: entrada, format: 'JPEG', quality: CALIDAD })
    let salida = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg)
    if (!salida.length) return { ok: false, error: MOTIVO.FALLO }
    salida = await achicar(salida, { sharpImpl: ctx.sharpImpl ?? null })
    return {
      ok: true,
      data: salida.toString('base64'),
      mediaType: MEDIA_DESTINO,
      convertidoDe: mediaType,
      bytes: salida.length,
    }
  } catch (e) {
    return { ok: false, error: `${MOTIVO.FALLO}: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}

function bytesDeBase64(b64) {
  const s = String(b64 ?? '')
  if (!s) return 0
  return Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
}
