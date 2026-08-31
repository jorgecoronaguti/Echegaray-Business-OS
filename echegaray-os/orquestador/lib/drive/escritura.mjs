// CREAR Y GESTIONAR ARCHIVOS. Identidad, ubicación y ciclo de vida — nunca el CONTENIDO.
//
// Tres reglas gobiernan todo lo de acá, y ninguna es negociable.
//
// 1. VERIFY-AFTER-WRITE. Ninguna función afirma que hizo algo sin haberlo releído del destino.
//    «Lo que prueba una escritura es el dato leído en su destino, nunca la pantalla que respondió
//    que sí»: en este repo un 204 de PostgREST ya se tomó como prueba de una escritura que no
//    ocurrió, y `handlers/operation_execute.mjs` todavía marca `executed` con lo que devolvió la
//    tool. Acá se relee y se compara sólo lo que la operación PROMETIÓ cambiar.
//
// 2. IDEMPOTENCIA POR CLAVE DE NEGOCIO, GUARDADA EN DRIVE. La marca vive en las `properties` del
//    propio archivo (`xsas_idem`), no en una tabla del OS. Dos motivos: una tabla puede quedar
//    desincronizada de Drive y entonces el control mentiría, y una property viaja con el archivo
//    aunque lo muevan o lo renombren. Se escribe EN LA MISMA llamada que crea el archivo, así no
//    existe la ventana «creado pero sin marcar» que haría duplicar al retry.
//    Se usan `properties` y no `appProperties` a propósito: el OS habla con Google con tres
//    identidades distintas (service account, cuenta operadora, cuenta personal) y `appProperties`
//    sólo es visible para el cliente OAuth que las escribió — la marca sería invisible para las
//    otras dos y el retry duplicaría igual.
//
// 3. TODA MUTACIÓN SE AUDITA. Si el auditor no puede escribir, la operación lo dice en su
//    respuesta (`audit.registrado === false` con motivo). Nunca se calla.
//
// Lo que NO está acá y no va a estar: borrado definitivo (Nivel F) y edición de contenido.

import { conDrive, argInvalido, noSoportada, CODIGO, DriveError } from './errores.mjs'
import { PROP_IDEMPOTENCIA, MIME_CARPETA, resumen, comparar } from './referencia.mjs'

/** Tipos que esta capacidad sabe crear como archivo NATIVO. Cualquier otra cosa se sube. */
export const TIPOS_NATIVOS = Object.freeze({
  carpeta: MIME_CARPETA,
  folder: MIME_CARPETA,
  doc: 'application/vnd.google-apps.document',
  documento: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  planilla: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
  presentacion: 'application/vnd.google-apps.presentation',
})

/** Cuánto se espera antes de reintentar la relectura de verificación.
 *  Drive puede tardar un instante en publicar el `parents` nuevo de un move. Un solo reintento:
 *  más que eso sería esconder una escritura que no ocurrió detrás de la paciencia. */
const REINTENTO_VERIFICACION_MS = 700
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

export function crearEscritura({ google, lectura, auditor = null, reloj = () => new Date(), esperaVerificacionMs = REINTENTO_VERIFICACION_MS }) {
  if (!google) throw argInvalido('escritura de Drive: falta el cliente Google')
  if (!lectura) throw argInvalido('escritura de Drive: falta la capa de lectura (la verificación la hace ella)')

  /** El sello de qué se verificó. Va en toda respuesta: un cierre sin evidencia no es un cierre. */
  const verificacion = (campos) => ({ campos, leido_en: reloj().toISOString(), metodo: 'relectura del destino' })

  /** Registra en la auditoría sin poder tumbar la operación, pero SIN callarse si falla. */
  async function auditar(evento) {
    if (!auditor) return { registrado: false, motivo: CODIGO.AUDIT_UNAVAILABLE, detalle: 'la capacidad se armó sin auditor' }
    try {
      const id = await auditor.registrar({ ...evento, ocurrido_en: reloj().toISOString() })
      return { registrado: true, id }
    } catch (e) {
      return { registrado: false, motivo: CODIGO.AUDIT_UNAVAILABLE, detalle: String(e?.message ?? e).slice(0, 300) }
    }
  }

  /**
   * LA RELECTURA QUE CONVIERTE UNA RESPUESTA EN UNA PRUEBA.
   * `esperado` son los valores que la operación prometió dejar; `campos`, los únicos que se
   * comparan (meter `modified_at` acá haría que todo pareciera exitoso siempre).
   */
  async function verificar(fileId, esperado, campos) {
    let ref = await lectura.referencia(fileId)
    let diff = comparar(esperado, ref, campos)
    if (Object.keys(diff).length) {
      await dormir(esperaVerificacionMs)
      ref = await lectura.referencia(fileId)
      diff = comparar(esperado, ref, campos)
    }
    if (Object.keys(diff).length) {
      throw new DriveError(CODIGO.VERIFY_FAILED,
        `La operación no quedó aplicada: lo releído del archivo ${fileId} no coincide con lo pedido.`,
        { detalle: JSON.stringify(diff).slice(0, 400), file_id: fileId, diff })
    }
    return ref
  }

  /** ¿Esta clave ya produjo un archivo? Devuelve la referencia existente o null. */
  async function yaHecho(clave) {
    if (!clave) return null
    return lectura.porClaveDeIdempotencia(clave)
  }

  function sobreExistente(clave, ref, operacion) {
    return {
      ok: true, operacion, idempotente: true, referencia: ref, antes: resumen(ref),
      verificado: { campos: [], leido_en: reloj().toISOString(), nota: 'no se ejecutó: la clave de idempotencia ya tenía un archivo' },
      audit: { registrado: false, motivo: 'sin efecto: no hay nada que auditar' },
    }
  }

  // ─────────────────────────────── CREATE ───────────────────────────────

  /**
   * Crea una CARPETA. `padre` opcional (sin él va a la raíz del Drive de la cuenta que crea).
   * @param {{nombre:string, padre?:string, clave_idempotencia?:string}} args
   */
  async function crearCarpeta({ nombre, padre = null, clave_idempotencia = null } = {}) {
    return crearNativo({ nombre, tipo: 'carpeta', padre, clave_idempotencia })
  }

  /**
   * Crea un archivo NATIVO vacío (doc / sheet / slides / carpeta). El CONTENIDO lo escribe el
   * motor que corresponda: esta capacidad crea el continente, no lo llena.
   */
  async function crearNativo({ nombre, tipo, padre = null, clave_idempotencia = null } = {}) {
    if (!nombre) throw argInvalido('falta el nombre del archivo a crear')
    const mimeType = TIPOS_NATIVOS[String(tipo ?? '').toLowerCase()]
    if (!mimeType) throw noSoportada(`No sé crear un "${tipo}". Tipos: ${Object.keys(TIPOS_NATIVOS).join(', ')}.`)
    const previo = await yaHecho(clave_idempotencia)
    if (previo) return sobreExistente(clave_idempotencia, previo, 'crear')

    if (padre) await lectura.referenciaViva(padre) // un padre en la papelera no es un destino

    const creado = await conDrive('el archivo nuevo', () => google.createFile({
      name: nombre, mimeType, parents: padre ? [padre] : undefined,
      properties: clave_idempotencia ? { [PROP_IDEMPOTENCIA]: clave_idempotencia } : undefined,
    }))
    if (!creado?.id) throw new DriveError(CODIGO.VERIFY_FAILED, 'Drive no devolvió el id del archivo creado.')
    const ref = await verificar(creado.id, { name: nombre, mime_type: mimeType, trashed: false }, ['name', 'mime_type', 'trashed'])
    const audit = await auditar({ operacion: 'crear', referencia: ref, antes: null, despues: resumen(ref), clave_idempotencia, verificado_campos: ['name', 'mime_type', 'trashed'] })
    return { ok: true, operacion: 'crear', idempotente: false, referencia: ref, antes: null, verificado: verificacion(['name', 'mime_type', 'trashed']), audit }
  }

  /** Sube BYTES a Drive. `contenido` en base64 (es lo que ya recibe `uploadFile`). */
  async function subir({ nombre, contenido_base64, mime_type, padre = null, clave_idempotencia = null } = {}) {
    if (!nombre) throw argInvalido('falta el nombre del archivo a subir')
    if (!contenido_base64) throw argInvalido('falta el contenido (base64) del archivo a subir')
    if (!mime_type) throw argInvalido('falta el mime_type del archivo a subir')
    const previo = await yaHecho(clave_idempotencia)
    if (previo) return sobreExistente(clave_idempotencia, previo, 'subir')
    if (padre) await lectura.referenciaViva(padre)

    const subido = await conDrive('el archivo subido', () => google.uploadFile(nombre, contenido_base64, mime_type, {
      parentId: padre ?? undefined,
      properties: clave_idempotencia ? { [PROP_IDEMPOTENCIA]: clave_idempotencia } : undefined,
    }))
    if (!subido?.id) throw new DriveError(CODIGO.VERIFY_FAILED, 'Drive no devolvió el id del archivo subido.')
    const ref = await verificar(subido.id, { name: nombre, trashed: false }, ['name', 'trashed'])
    const audit = await auditar({ operacion: 'subir', referencia: ref, antes: null, despues: resumen(ref), clave_idempotencia, verificado_campos: ['name', 'trashed'] })
    return { ok: true, operacion: 'subir', idempotente: false, referencia: ref, antes: null, verificado: verificacion(['name', 'trashed']), audit }
  }

  // ───────────────────────────── MANAGEMENT ─────────────────────────────

  /** Renombra. Idempotente por naturaleza: dejar el nombre en X dos veces termina en X. */
  async function renombrar({ file_id, nombre } = {}) {
    if (!file_id) throw argInvalido('falta file_id')
    if (!nombre) throw argInvalido('falta el nombre nuevo')
    const antes = await lectura.referenciaViva(file_id)
    await conDrive(`el archivo ${file_id}`, () => google.renameFile(file_id, nombre))
    const ref = await verificar(file_id, { name: nombre }, ['name'])
    const audit = await auditar({ operacion: 'renombrar', referencia: ref, antes: resumen(antes), despues: resumen(ref), verificado_campos: ['name'] })
    return { ok: true, operacion: 'renombrar', idempotente: antes.name === nombre, referencia: ref, antes: resumen(antes), verificado: verificacion(['name']), audit }
  }

  /** Mueve a otra carpeta. Se verifica releyendo `parents`, que es lo único que prueba el move. */
  async function mover({ file_id, destino } = {}) {
    if (!file_id) throw argInvalido('falta file_id')
    if (!destino) throw argInvalido('falta la carpeta destino')
    const antes = await lectura.referenciaViva(file_id)
    const carpeta = await lectura.referenciaViva(destino)
    if (!carpeta.is_folder) throw argInvalido(`el destino ${destino} no es una carpeta (es ${carpeta.mime_type})`)
    if (antes.parents.length === 1 && antes.parents[0] === destino) {
      return { ok: true, operacion: 'mover', idempotente: true, referencia: antes, antes: resumen(antes), verificado: verificacion(['parents']), audit: { registrado: false, motivo: 'sin efecto: ya estaba en esa carpeta' } }
    }
    await conDrive(`el archivo ${file_id}`, () => google.moveFile(file_id, destino))
    const ref = await verificar(file_id, { parents: [destino] }, ['parents'])
    const audit = await auditar({ operacion: 'mover', referencia: ref, antes: resumen(antes), despues: resumen(ref), verificado_campos: ['parents'] })
    return { ok: true, operacion: 'mover', idempotente: false, referencia: ref, antes: resumen(antes), verificado: verificacion(['parents']), audit }
  }

  /** Duplica. La copia NO hereda la clave de idempotencia del original: se pisa o se borra. */
  async function copiar({ file_id, nombre, destino = null, clave_idempotencia = null } = {}) {
    if (!file_id) throw argInvalido('falta file_id del archivo a copiar')
    if (!nombre) throw argInvalido('falta el nombre de la copia')
    const previo = await yaHecho(clave_idempotencia)
    if (previo) return sobreExistente(clave_idempotencia, previo, 'copiar')
    const origen = await lectura.referenciaViva(file_id)
    if (origen.is_folder) throw noSoportada('Drive no copia carpetas en una sola operación: hay que crear la carpeta y copiar su contenido.')
    if (destino) await lectura.referenciaViva(destino)

    const copia = await conDrive(`el archivo ${file_id}`, () => google.copyFile(file_id, nombre, destino ? [destino] : undefined, {
      // `null` BORRA la property heredada del original. Sin esto, copiar un archivo marcado
      // haría que su clave apareciera dos veces y el control de idempotencia mentiría.
      properties: { [PROP_IDEMPOTENCIA]: clave_idempotencia ?? null },
    }))
    if (!copia?.id) throw new DriveError(CODIGO.VERIFY_FAILED, 'Drive no devolvió el id de la copia.')
    const esperado = { name: nombre, trashed: false, ...(destino ? { parents: [destino] } : {}) }
    const campos = destino ? ['name', 'trashed', 'parents'] : ['name', 'trashed']
    const ref = await verificar(copia.id, esperado, campos)
    const audit = await auditar({ operacion: 'copiar', referencia: ref, antes: resumen(origen), despues: resumen(ref), clave_idempotencia, verificado_campos: campos })
    return { ok: true, operacion: 'copiar', idempotente: false, referencia: ref, antes: resumen(origen), verificado: verificacion(campos), audit }
  }

  /** ARCHIVAR = papelera. Reversible 30 días. El borrado definitivo no existe en esta capacidad. */
  async function archivar({ file_id } = {}) {
    if (!file_id) throw argInvalido('falta file_id')
    const antes = await lectura.referencia(file_id)
    if (antes.trashed) {
      return { ok: true, operacion: 'archivar', idempotente: true, referencia: antes, antes: resumen(antes), verificado: verificacion(['trashed']), audit: { registrado: false, motivo: 'sin efecto: ya estaba en la papelera' } }
    }
    await conDrive(`el archivo ${file_id}`, () => google.trashFile(file_id))
    const ref = await verificar(file_id, { trashed: true }, ['trashed'])
    const audit = await auditar({ operacion: 'archivar', referencia: ref, antes: resumen(antes), despues: resumen(ref), verificado_campos: ['trashed'] })
    return { ok: true, operacion: 'archivar', idempotente: false, referencia: ref, antes: resumen(antes), verificado: verificacion(['trashed']), audit }
  }

  /** El borrado definitivo es Nivel F. Existe la función SÓLO para que el intento tenga nombre. */
  async function borrarDefinitivo() {
    throw new DriveError(CODIGO.FORBIDDEN,
      'El borrado definitivo de Drive es Nivel F: esta capacidad no lo ejecuta nunca. Usá archivar (papelera).')
  }

  /**
   * Exporta un nativo de Google a otro formato Y LO DEJA EN DRIVE (a diferencia de
   * `lectura.exportar`, que devuelve bytes en memoria). Hoy Drive sólo permite guardar el
   * resultado como PDF por esta vía; cualquier otro formato se dice, no se intenta.
   */
  async function exportarADrive({ file_id, formato = 'pdf', nombre = null, destino = null, clave_idempotencia = null } = {}) {
    if (!file_id) throw argInvalido('falta file_id')
    if (String(formato).toLowerCase() !== 'pdf') {
      throw noSoportada(`Guardar la conversión en Drive sólo está soportado a PDF (pediste ${formato}). Para otros formatos usá exportar(), que devuelve los bytes.`)
    }
    const previo = await yaHecho(clave_idempotencia)
    if (previo) return sobreExistente(clave_idempotencia, previo, 'exportar')
    const origen = await lectura.referenciaViva(file_id)
    if (destino) await lectura.referenciaViva(destino)
    const salida = await conDrive(`el archivo ${file_id}`, () => google.exportarComoPdf(file_id, {
      nombre: nombre ?? `${origen.name}.pdf`, parentId: destino ?? undefined,
    }))
    if (!salida?.id) throw new DriveError(CODIGO.VERIFY_FAILED, 'Drive no devolvió el id del PDF exportado.')
    const ref = await verificar(salida.id, { trashed: false }, ['trashed'])
    const audit = await auditar({ operacion: 'exportar', referencia: ref, antes: resumen(origen), despues: resumen(ref), clave_idempotencia, verificado_campos: ['trashed'] })
    return { ok: true, operacion: 'exportar', idempotente: false, referencia: ref, antes: resumen(origen), verificado: verificacion(['trashed']), audit }
  }

  return { crearCarpeta, crearNativo, subir, renombrar, mover, copiar, archivar, borrarDefinitivo, exportarADrive, _verificar: verificar }
}
