// LA DEGRADACIÓN TIENE NOMBRE.
//
// ═══ POR QUÉ UN CATÁLOGO Y NO UN STRING ═══
//
// Un motor que falla devolviendo `{error: "no pude crear el documento: ..."}` obliga a quien llama
// —y sobre todo al modelo, que es quien más lo llama— a adivinar si conviene reintentar, pedir un
// permiso, cambiar el pedido o avisarle a una persona. Son cuatro conductas distintas y el texto
// libre no las distingue. El código sí, y además se puede afirmar en un test.
//
// ═══ LO QUE UN FALLO NUNCA HACE ═══
//
// No afirma que algo se creó o se editó. La regla de este repositorio es que lo que prueba una
// escritura es el dato leído en su destino: mientras no haya relectura, el resultado es `ok:false`
// aunque la API haya contestado 200. `WRITE_NOT_PERSISTED` existe exactamente para ese caso — la
// petición entró, la respuesta fue buena, y el destino no tiene lo que se pidió.

/** Los códigos. Cerrado a propósito: agregar uno es una decisión que queda en el diff. */
export const CODIGO = Object.freeze({
  // Del contenido o del pedido
  INVALID_CONTENT: 'INVALID_CONTENT',                 // la estructura no cumple el contrato
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',           // no existe ese template_id en el catálogo
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',   // falta un dato que el template declara obligatorio
  SECTION_NOT_FOUND: 'SECTION_NOT_FOUND',             // la sección pedida no existe en el documento
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',     // la operación no está implementada para ese tipo
  // Del permiso
  FORBIDDEN: 'FORBIDDEN',                             // el actor no puede hacer esto
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',         // hace falta una autorización que todavía no está
  // Del mundo
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',                   // el file_id no existe o está en la papelera
  DRIVE_UNAVAILABLE: 'DRIVE_UNAVAILABLE',             // Drive/Docs/Slides no respondieron
  WRITE_NOT_PERSISTED: 'WRITE_NOT_PERSISTED',         // la API dijo que sí y el destino dice que no
})

/** Un fallo con nombre. PURA. Nunca lanza: los motores devuelven, no tiran. */
export function fallo(codigo, motivo, extra = {}) {
  if (!CODIGO[codigo]) throw new Error(`código de fallo desconocido: ${codigo}`)
  return { ok: false, codigo, motivo: String(motivo ?? '').slice(0, 400), ...extra }
}

/** ¿Este resultado es un fallo de los motores? PURA. */
export const esFallo = (r) => Boolean(r && r.ok === false && typeof r.codigo === 'string')

const STATUS = new Map([
  [400, CODIGO.INVALID_CONTENT],
  [401, CODIGO.PERMISSION_REQUIRED],
  [403, CODIGO.FORBIDDEN],
  [404, CODIGO.FILE_NOT_FOUND],
  [429, CODIGO.DRIVE_UNAVAILABLE],
])

/**
 * DE UN ERROR DE GOOGLE A UN CÓDIGO. PURA.
 *
 * El status viene en `e.status` cuando lo puso `lib/google.mjs`, y en el texto del mensaje cuando
 * el error nació adentro de `fetch` («google api 403: …»). Se miran los dos: quedarse sólo con la
 * propiedad convierte un 403 legible en un `DRIVE_UNAVAILABLE` que invita a reintentar para siempre.
 */
export function codigoDeErrorGoogle(e) {
  const status = Number(e?.status) || Number(String(e?.message ?? '').match(/\b(\d{3})\b/)?.[1]) || 0
  if (STATUS.has(status)) return STATUS.get(status)
  if (status >= 500) return CODIGO.DRIVE_UNAVAILABLE
  const msg = String(e?.message ?? e ?? '')
  if (/timeout|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(msg)) return CODIGO.DRIVE_UNAVAILABLE
  if (/MISSING_GOOGLE_CREDENTIAL|credencial de Google ausente/i.test(msg)) return CODIGO.PERMISSION_REQUIRED
  return CODIGO.DRIVE_UNAVAILABLE
}

/** Envuelve una llamada a Google y devuelve `{ok:true, valor}` o un fallo con nombre. */
export async function intentar(fn, contexto = 'la operación') {
  try { return { ok: true, valor: await fn() } }
  catch (e) {
    return fallo(codigoDeErrorGoogle(e), `${contexto}: ${String(e?.message ?? e).slice(0, 200)}`)
  }
}
