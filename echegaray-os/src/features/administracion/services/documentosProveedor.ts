// LOS DOCUMENTOS DE UN PROVEEDOR — las reglas, sin base, sin red y sin React.
//
// Pedido del dueño, 09/09/2026: «permitime cargarle documentos a los proveedores como los contratos
// de subcontratistas o demás contenido audiovisual o PDF o Word o lo que sea que necesite cargar».
//
// Lo que se decide ANTES de subir (qué entra, cómo se llama el objeto en Storage) y lo que se dice
// DESPUÉS (el error en castellano) vive acá, puro, y se prueba con `node --test`. Lo impuro —el
// `upload()` y el `insert()`— está en `subidaDocumentoProveedor.ts` y en las acciones.
//
// ═══ ACÁ NO HAY LISTA BLANCA DE TIPOS, Y ES LA DIFERENCIA CON `comprobanteEntrada` ═══
//
// Un comprobante lo tiene que poder LEER el modelo de visión, así que un `.docx` en esa puerta es
// trabajo que nadie va a poder hacer. Un contrato no se lee: se guarda y se baja. Rechazar un
// `.docx`, un `.dwg` o un `.mp4` sería rechazar exactamente lo que el dueño nombró.

/** Para qué sirve el papel. Es el CHECK de `public.proveedor_documento.categoria`, palabra por palabra. */
export const CATEGORIAS = ['contrato', 'seguro', 'habilitacion', 'factura_modelo', 'otro'] as const
export type CategoriaDocumento = (typeof CATEGORIAS)[number]

/** Cómo se nombra cada categoría en pantalla. */
export const ROTULO_CATEGORIA: Record<CategoriaDocumento, string> = {
  contrato: 'Contrato',
  seguro: 'Seguro',
  habilitacion: 'Habilitación',
  factura_modelo: 'Factura modelo',
  otro: 'Otro',
}

export function esCategoria(v: unknown): v is CategoriaDocumento {
  return typeof v === 'string' && (CATEGORIAS as readonly string[]).includes(v)
}

/** El techo por archivo del bucket `proveedores-documentos`. Subirlo acá sin subirlo allá haría que
 *  el archivo viaje entero para rebotar arriba, con la persona esperando. */
export const MAX_BYTES = 50 * 1024 * 1024

/** Cuántos entran por tanda. Doce es lo que ya usa la carga de comprobantes; no hay razón para que
 *  una carpeta de contratos se comporte distinto de un fajo de facturas. */
export const MAX_ARCHIVOS = 12

/** Lo mínimo que hace falta de un `File` para decidir. Estructural: un `File` encaja. */
export interface ArchivoElegible {
  name: string
  type?: string
  size: number
}

/** La fila de `public.proveedor_documento` tal como la lee la ficha. */
export interface DocumentoProveedor {
  id: string
  nombre_archivo: string
  tipo_mime: string
  tamano_bytes: number
  categoria: CategoriaDocumento
  descripcion: string | null
  creado_en: string
  subido_por: string
  /** El nombre de quien lo subió, si se pudo resolver. `null` = no se pudo, y NO es «nadie». */
  subido_por_nombre: string | null
}

const CUANDO_NO_SE_SABE = 'application/octet-stream'

/**
 * ¿ESTE ARCHIVO SE PUEDE SUBIR, Y CON QUÉ TIPO?
 *
 * El tipo NO decide si entra: decide con qué `contentType` se guarda, para que al bajarlo el
 * navegador sepa qué es. Un `.docx` viejo llega sin `type` en varios navegadores y un `.dwg` no
 * tiene tipo registrado en ninguno; poner `application/octet-stream` en esos casos es decir la
 * verdad («no sé qué es, guardalo tal cual»), no adivinar.
 */
export function archivoAceptable(
  f: ArchivoElegible,
): { ok: true; mediaType: string } | { ok: false; error: string } {
  const nombre = String(f.name ?? '').trim()
  if (!nombre) return { ok: false, error: 'Un archivo sin nombre no se puede guardar.' }
  if (nombre.length > 255) return { ok: false, error: `«${nombre.slice(0, 40)}…» tiene un nombre demasiado largo.` }
  // UN ARCHIVO DE 0 BYTES NO ES UN ARCHIVO. Storage lo acepta y la ficha mostraría un contrato que
  // al bajarlo está vacío: peor que no tenerlo, porque afirma que el respaldo existe.
  if (!(f.size > 0)) return { ok: false, error: `«${nombre}» está vacío.` }
  if (f.size > MAX_BYTES) {
    return { ok: false, error: `«${nombre}» pesa más de ${MAX_BYTES / (1024 * 1024)} MB. Subilo a Drive y dejá acá el contrato.` }
  }
  const declarado = String(f.type ?? '').split(';')[0].trim().toLowerCase()
  return { ok: true, mediaType: /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(declarado) ? declarado : CUANDO_NO_SE_SABE }
}

export interface RevisionDeLote<T extends ArchivoElegible> {
  aceptados: { archivo: T; mediaType: string }[]
  rechazados: { nombre: string; error: string }[]
  sobrantes: string[]
  aviso: string | null
}

/**
 * QUÉ ENTRA Y QUÉ NO, ARCHIVO POR ARCHIVO — y el sobrante SE NOMBRA.
 *
 * Un archivo malo no voltea el lote, y el tope se aplica sobre los ACEPTADOS: contar los rechazados
 * contra el tope dejaría afuera contratos buenos por culpa de los malos. Recortar en silencio es
 * perder papeles sin que nadie se entere hasta que falten.
 */
export function revisarLote<T extends ArchivoElegible>(elegidos: readonly T[]): RevisionDeLote<T> {
  const aceptados: { archivo: T; mediaType: string }[] = []
  const rechazados: { nombre: string; error: string }[] = []
  const sobrantes: string[] = []

  for (const archivo of elegidos) {
    const control = archivoAceptable(archivo)
    if (!control.ok) rechazados.push({ nombre: archivo.name, error: control.error })
    else if (aceptados.length < MAX_ARCHIVOS) aceptados.push({ archivo, mediaType: control.mediaType })
    else sobrantes.push(archivo.name)
  }

  const partes = rechazados.map((r) => r.error)
  if (sobrantes.length) {
    partes.push(
      `Entran hasta ${MAX_ARCHIVOS} archivos por vez: ${sobrantes.map((s) => `«${s}»`).join(', ')} `
      + `${sobrantes.length === 1 ? 'quedó' : 'quedaron'} afuera.`,
    )
  }
  return { aceptados, rechazados, sobrantes, aviso: partes.length ? partes.join(' ') : null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * LA EXTENSIÓN CON LA QUE SE GUARDA EL OBJETO, sacada del NOMBRE y nunca del tipo.
 *
 * Al revés que en los comprobantes, donde el tipo manda porque la lista de tipos es cerrada: acá el
 * tipo puede ser `application/octet-stream` para un `.dwg` perfectamente válido, y la única pista
 * de qué es ese archivo es cómo se llama. Se recorta a `[a-z0-9]` y a 12 caracteres: lo que viene
 * del nombre de un archivo no puede meter una barra ni un `..` en la ruta del bucket.
 */
export function extensionDeNombre(nombre: string): string {
  const cruda = String(nombre ?? '').toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1]
  return cruda ?? 'bin'
}

/**
 * EL NOMBRE DEL OBJETO EN EL BUCKET: `<uid>/<proveedor_id>/<uuid>.<ext>`.
 *
 * Las dos primeras carpetas son parte de la cerradura y no un orden lindo:
 *   · la policy de Storage exige `(storage.foldername(name))[1] = auth.uid()::text`,
 *   · la policy de la TABLA exige `storage_path like auth.uid()/proveedor_id/%`.
 * Si el uid llegara vacío la ruta empezaría con `/`, la primera carpeta sería la cadena vacía y
 * Storage devolvería un «row-level security» que no le dice nada a nadie. Por eso se valida acá,
 * donde se puede explicar.
 */
export function rutaDeDocumento(
  p: { uid: string; proveedorId: string; id: string; nombre: string },
): string {
  const piezas: [string, string][] = [['usuario', p.uid], ['proveedor', p.proveedorId], ['archivo', p.id]]
  for (const [rotulo, valor] of piezas) {
    if (!UUID.test(valor)) throw new Error(`La ruta del documento necesita un ${rotulo} válido; vino «${valor}».`)
  }
  return `${p.uid}/${p.proveedorId}/${p.id}.${extensionDeNombre(p.nombre)}`
}

/**
 * La misma pregunta que hace la policy de la tabla, del lado del servidor.
 *
 * Existe para que la acción que registra la fila no se pueda usar como ariete: sin esto, alguien
 * podría mandar el `storage_path` del contrato de OTRO proveedor y la ficha lo mostraría como suyo.
 * La policy lo rebotaría igual —esa es la cerradura— pero el error sería un «violates row-level
 * security» ilegible, y un control que sólo existe en un lado se pierde en la próxima refactorización.
 */
export function esRutaDelProveedor(ruta: string, uid: string, proveedorId: string): boolean {
  if (!UUID.test(uid) || !UUID.test(proveedorId)) return false
  const partes = String(ruta ?? '').split('/')
  return partes.length === 3 && partes[0] === uid && partes[1] === proveedorId && partes[2].length > 0
}

const SIN_PERMISO = 'Tu usuario no tiene permiso para cargar documentos de proveedores. Si creés que sí debería, avisale a Dirección.'

/**
 * EL ERROR DE STORAGE O DE POSTGRES, DICHO EN CASTELLANO — y si no se reconoce, TAL CUAL.
 *
 * El default devuelve el mensaje literal a propósito: inventar «hubo un problema» sobre un error que
 * no se reconoce esconde justo el dato que hace falta para arreglarlo.
 */
export function traducirError(mensaje: string): string {
  if (/permission denied|row-level security|violates row-level|not authorized/i.test(mensaje)) return SIN_PERMISO
  if (/relation .* does not exist|schema cache/i.test(mensaje)) {
    return 'Todavía no puedo recibir documentos por acá: falta aplicar la migración en la base. Avisale a Dirección.'
  }
  if (/bucket not found/i.test(mensaje)) {
    return 'Todavía no está creado el depósito de documentos en la base. Avisale a Dirección.'
  }
  if (/duplicate key|resource already exists|already exists/i.test(mensaje)) return 'Ese archivo ya estaba guardado.'
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(mensaje)) {
    return `Pesa más de ${MAX_BYTES / (1024 * 1024)} MB. Subilo a Drive y dejá acá el documento.`
  }
  if (/jwt expired|invalid claim|token is expired/i.test(mensaje)) {
    return 'Tu sesión venció mientras subía. Volvé a entrar y probá otra vez.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) {
    return 'Se cortó la conexión mientras subía. Probá de nuevo cuando tengas señal.'
  }
  return mensaje
}

/** El peso del archivo como lo lee una persona. KB hasta el mega, MB con un decimal arriba. */
export function pesoLegible(bytes: number): string {
  if (!(bytes > 0)) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
