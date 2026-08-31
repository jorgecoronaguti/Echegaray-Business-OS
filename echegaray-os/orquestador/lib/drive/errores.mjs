// LA DEGRADACIÓN TIENE NOMBRE PROPIO, Y EL NOMBRE ACUSA AL CULPABLE CORRECTO.
//
// El contrato de la capacidad: si Google no contesta, el que está caído es DRIVE, no XSAS.
// Un `DRIVE_UNAVAILABLE` le dice a quien llama «reintentá, el resto del OS anda»; un
// «XSAS_UNAVAILABLE» lo mandaría a revisar el sistema equivocado. Por eso este módulo no tiene
// ningún código que hable del OS: no existe la forma de emitirlo, y hay un test que lo prueba
// recorriendo la tabla entera.
//
// La otra mitad del contrato es que un error de Google llegue clasificado y no crudo. Hoy las tools
// devuelven `{error: "google upload 403: ..."}`: quien lo recibe tiene que leer la cadena para
// decidir si reintentar, pedir permisos o rendirse. Un status HTTP no es una decisión — acá se
// convierte en una.
//
// Distinción que cuesta plata confundir:
//   FORBIDDEN            el actor NO puede, y no hay nada que autorizar: se rechaza y punto.
//   PERMISSION_REQUIRED  el actor PODRÍA, pero falta el consentimiento/alcance: hay algo que hacer.

/** Los únicos códigos que esta capacidad emite. Ninguno nombra al OS: ver arriba. */
export const CODIGO = Object.freeze({
  DRIVE_UNAVAILABLE: 'DRIVE_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',
  TRASHED: 'TRASHED',
  FORBIDDEN: 'FORBIDDEN',
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  VERIFY_FAILED: 'VERIFY_FAILED',
  CONFLICT: 'CONFLICT',
  QUOTA: 'QUOTA',
  AUDIT_UNAVAILABLE: 'AUDIT_UNAVAILABLE',
})

/** Sólo lo transitorio se reintenta. Un 403 reintentado mil veces sigue siendo un 403. */
const REINTENTABLES = new Set([CODIGO.DRIVE_UNAVAILABLE])
export const esReintentable = (codigo) => REINTENTABLES.has(codigo)

/** Error de la capacidad. `codigo` es de CODIGO; `detalle` es para el log, nunca un secreto. */
export class DriveError extends Error {
  constructor(codigo, mensaje, { detalle = null, causa = null, ...extra } = {}) {
    super(mensaje)
    this.name = 'DriveError'
    this.codigo = codigo
    this.detalle = detalle == null ? null : String(detalle).slice(0, 500)
    this.reintentable = esReintentable(codigo)
    if (causa) this.cause = causa
    Object.assign(this, extra)
  }
  /** Forma serializable — lo que viaja a un log, a una tool o a una respuesta HTTP. */
  aObjeto() {
    return { error: this.codigo, mensaje: this.message, detalle: this.detalle, reintentable: this.reintentable }
  }
}

/** Atajos, para que el sitio de la falla se lea de un vistazo. */
export const noEncontrado = (que, detalle) => new DriveError(CODIGO.NOT_FOUND, `No existe ${que}.`, { detalle })
export const enPapelera = (que, detalle) => new DriveError(CODIGO.TRASHED, `${que} está en la papelera de Drive.`, { detalle })
export const argInvalido = (mensaje, detalle) => new DriveError(CODIGO.INVALID_ARGUMENT, mensaje, { detalle })
export const noSoportada = (mensaje, detalle) => new DriveError(CODIGO.UNSUPPORTED_OPERATION, mensaje, { detalle })

const texto = (e) => String(e?.message ?? e ?? '')

/** El status HTTP, mirando donde google.mjs lo deja (`e.status`) y, si no está, en el mensaje. */
export function statusDe(err) {
  if (Number.isFinite(err?.status)) return Number(err.status)
  const m = /\b(400|401|403|404|409|429|500|502|503|504)\b/.exec(texto(err))
  return m ? Number(m[1]) : null
}

// Una red que no responde no llega con status: llega como código de sistema o como el abort del
// timeout que `makeGoogleClient` le pone a cada llamada. Todos son la misma noticia: Drive no está.
const RED = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|network|fetch failed|aborted|AbortError|The operation was aborted/i

/**
 * Convierte cualquier cosa que haya explotado en un DriveError con código.
 * Si ya es un DriveError, se devuelve tal cual: clasificar dos veces perdería el motivo original.
 */
export function clasificar(err, { que = 'el archivo' } = {}) {
  if (err instanceof DriveError) return err
  const detalle = texto(err).slice(0, 500)
  const status = statusDe(err)
  const codigoSistema = String(err?.code ?? '')

  if (status === 404 || /not found|no encontrad/i.test(detalle)) {
    return new DriveError(CODIGO.NOT_FOUND, `No existe ${que}.`, { detalle, causa: err })
  }
  if (status === 403) {
    if (/storageQuota|quota has been exceeded|quotaExceeded/i.test(detalle)) {
      return new DriveError(CODIGO.QUOTA, 'Drive rechazó la operación por almacenamiento: la cuenta que la ejecuta no tiene cuota.', { detalle, causa: err })
    }
    // Un scope insuficiente o una delegación mal configurada SE ARREGLAN autorizando; un
    // "no sos dueño de este archivo" no. Mezclarlos manda a la persona al lugar equivocado.
    if (/insufficient|scope|unauthorized_client|delegat|accessNotConfigured/i.test(detalle)) {
      return new DriveError(CODIGO.PERMISSION_REQUIRED, 'Falta autorizar el acceso a Drive para esta operación.', { detalle, causa: err })
    }
    return new DriveError(CODIGO.FORBIDDEN, `Drive no permite esa operación sobre ${que}.`, { detalle, causa: err })
  }
  if (status === 401 || /invalid_grant|credencial de Google ausente|MissingGoogleCredential/i.test(detalle) || err?.name === 'MissingGoogleCredential') {
    return new DriveError(CODIGO.PERMISSION_REQUIRED, 'La credencial de Google no está o venció: hay que volver a autorizar.', { detalle, causa: err })
  }
  if (status === 400) {
    return new DriveError(CODIGO.INVALID_ARGUMENT, 'Drive rechazó los argumentos de la operación.', { detalle, causa: err })
  }
  if (status === 409) {
    return new DriveError(CODIGO.CONFLICT, 'La operación chocó con el estado actual del archivo.', { detalle, causa: err })
  }
  if (status === 429 || (status != null && status >= 500) || RED.test(detalle) || RED.test(codigoSistema)) {
    return new DriveError(CODIGO.DRIVE_UNAVAILABLE, 'Drive no está respondiendo. El resto del OS sigue funcionando.', { detalle, causa: err })
  }
  // Sin status ni firma de red no se puede afirmar que Drive esté caído. Decir DRIVE_UNAVAILABLE
  // acá sería fabricar un diagnóstico: se devuelve el error tal cual, sin adornarlo.
  return new DriveError(CODIGO.CONFLICT, 'La operación de Drive falló por un motivo no clasificado.', { detalle, causa: err })
}

/** Envuelve una llamada a Google para que TODO lo que salga de ella salga clasificado. */
export async function conDrive(que, fn) {
  try {
    return await fn()
  } catch (err) {
    throw clasificar(err, { que })
  }
}
