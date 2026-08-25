// LA SUBIDA VA DEL NAVEGADOR AL BUCKET — las reglas, sin red, sin Supabase y sin React.
//
// ═══ EL DEFECTO QUE ESTO CORRIGE (25/08/2026, probado en producción) ═══
//
// Subir una foto de celular de 4,4 MB desde /administracion/compras devolvía **500 «Body exceeded
// 1 MB limit»** y la pantalla quedaba en el error genérico de React. El archivo viajaba DENTRO del
// cuerpo de una Server Action, y el cuerpo de una Server Action tiene 1 MB de techo.
//
// Subir `serverActions.bodySizeLimit` NO alcanza: arriba de Next está Vercel, que corta el cuerpo de
// una función en 4,5 MB. El techo del comprobante es 5 MB (`MAX_BYTES`, el del modelo de visión), o
// sea que el caso que hay que soportar es justamente el que no entra. La única forma de que un
// archivo de 5 MB llegue es que NO pase por la función: el navegador lo pone en el bucket con la
// sesión del usuario, y la Server Action recibe después SÓLO el renglón.
//
// ═══ POR QUÉ ESTO ES UN MÓDULO APARTE Y PURO ═══
//
// Lo que decide qué entra, cómo se llama el objeto en Storage y qué se le dice a la persona cuando
// tres de cinco subieron es la parte que se puede probar sin navegador. Lo impuro —el `upload()` y
// el `insert()`— vive en `subidaDirecta.ts` y en la acción.

import { MAX_ARCHIVOS, MAX_BYTES, archivoAceptable, extensionDe } from './comprobanteEntrada.ts'

/** Lo mínimo que hace falta de un `File` para decidir. Estructural a propósito: un `File` encaja. */
export interface ArchivoElegible {
  name: string
  type?: string
  size: number
}

export interface RevisionDeLote<T extends ArchivoElegible> {
  /** Los que se pueden subir, con el tipo con el que hay que subirlos. */
  aceptados: { archivo: T; mediaType: string }[]
  /** Los que no, con el motivo escrito para la persona. */
  rechazados: { nombre: string; error: string }[]
  /** Los que sobran del tope por tanda. */
  sobrantes: string[]
  /** Todo lo anterior en una sola frase, o `null` si no hay nada que avisar. */
  aviso: string | null
}

/**
 * QUÉ ENTRA Y QUÉ NO, ARCHIVO POR ARCHIVO.
 *
 * ═══ UN ARCHIVO MALO YA NO VOLTEA EL LOTE ═══
 *
 * Antes, un `.xlsx` colado entre cinco fotos bloqueaba el botón para las cinco. Con el papel en la
 * mano eso se lee como «no anda»: lo que corresponde es decir cuál no sirve y subir los otros
 * cuatro.
 *
 * ═══ EL TOPE SE APLICA SOBRE LOS ACEPTADOS ═══
 *
 * Contar los rechazados contra el tope de 12 dejaría afuera comprobantes buenos por culpa de los
 * malos. Y el sobrante se NOMBRA: recortar en silencio —lo que hacía el `.slice(0, MAX_ARCHIVOS)`
 * anterior— es perder tres facturas sin que nadie se entere hasta que falten en el libro.
 */
export function revisarLote<T extends ArchivoElegible>(elegidos: readonly T[]): RevisionDeLote<T> {
  const aceptados: { archivo: T; mediaType: string }[] = []
  const rechazados: { nombre: string; error: string }[] = []
  const sobrantes: string[] = []

  for (const archivo of elegidos) {
    const control = archivoAceptable({ name: archivo.name, type: archivo.type, size: archivo.size })
    if (!control.ok) rechazados.push({ nombre: archivo.name, error: control.error })
    else if (aceptados.length < MAX_ARCHIVOS) aceptados.push({ archivo, mediaType: control.mediaType })
    else sobrantes.push(archivo.name)
  }

  return { aceptados, rechazados, sobrantes, aviso: redactarAviso(rechazados, sobrantes) }
}

function redactarAviso(
  rechazados: readonly { error: string }[], sobrantes: readonly string[],
): string | null {
  const partes = rechazados.map((r) => r.error)
  if (sobrantes.length) {
    partes.push(
      `Entran hasta ${MAX_ARCHIVOS} comprobantes por vez: ${sobrantes.map((s) => `«${s}»`).join(', ')} ` +
      `${sobrantes.length === 1 ? 'quedó' : 'quedaron'} afuera. Subilos en otra tanda.`,
    )
  }
  return partes.length ? partes.join(' ') : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * EL NOMBRE DEL OBJETO EN EL BUCKET: `<uid>/<lote>/<uuid>.<ext>`.
 *
 * La PRIMERA carpeta tiene que ser el uid y no otra cosa: la policy `comprobantes_sube_administracion`
 * exige `(storage.foldername(name))[1] = auth.uid()::text`. Si el uid llegara vacío, la ruta
 * empezaría con `/`, la primera carpeta sería la cadena vacía y Storage devolvería un «row-level
 * security» que no le dice nada a nadie. Por eso se valida acá, donde se puede explicar.
 *
 * La extensión sale del MEDIA TYPE, nunca del nombre que trajo el teléfono: un `.HEIC` que Safari
 * manda sin `type` tiene que quedar guardado como `.heic`, y un nombre inventado no puede decidir
 * cómo se guarda el archivo.
 */
export function rutaDeComprobante(
  p: { uid: string; lote: string; id: string; mediaType: string },
): string {
  const piezas: [string, string][] = [['usuario', p.uid], ['lote', p.lote], ['archivo', p.id]]
  for (const [rotulo, valor] of piezas) {
    if (!UUID.test(valor)) throw new Error(`La ruta del comprobante necesita un ${rotulo} válido; vino «${valor}».`)
  }
  return `${p.uid}/${p.lote}/${p.id}.${extensionDe(p.mediaType)}`
}

/** La misma pregunta que hace `storage.foldername(name)[1] = auth.uid()`, del lado del servidor. */
export function esRutaDelUsuario(ruta: string, uid: string): boolean {
  return uid.length > 0 && ruta.split('/')[0] === uid
}

export type ResultadoDeArchivo =
  | { id: string; nombre: string; ok: true }
  | { id: string; nombre: string; ok: false; error: string }

export interface Reparto {
  subidos: number
  fallidos: number
  /** Lo verde. `null` cuando no entró ninguno. */
  mensaje: string | null
  /** Lo rojo, nombrando cuál y por qué. `null` cuando entraron todos. */
  error: string | null
}

const COLA = 'El OS los lee y los carga en Compras; el estado aparece acá abajo.'

/**
 * QUÉ SE LE DICE A LA PERSONA CUANDO EL LOTE SALIÓ A MEDIAS.
 *
 * ═══ UN LOTE MIXTO TIENE QUE DECIR LAS DOS COSAS ═══
 *
 * Si tres de cinco entraron y sólo se muestra el verde, alguien se va con dos facturas que cree
 * cargadas y no están. Si sólo se muestra el rojo, vuelve a subir las cinco y el OS gasta el modelo
 * de visión de nuevo sobre tres que ya leyó. Las dos frases conviven o el mensaje miente.
 */
export function repartirResultados(rs: readonly ResultadoDeArchivo[]): Reparto {
  const entraron = rs.filter((r) => r.ok).length
  const fallaron = rs.filter((r): r is Extract<ResultadoDeArchivo, { ok: false }> => !r.ok)
  return {
    subidos: entraron,
    fallidos: fallaron.length,
    mensaje: entraron ? fraseDeLosQueEntraron(entraron, fallaron.length) : null,
    error: fallaron.length
      ? `No ${fallaron.length === 1 ? 'entró' : 'entraron'}: ${fallaron.map((f) => `«${f.nombre}» — ${f.error}`).join(' · ')}`
      : null,
  }
}

function fraseDeLosQueEntraron(entraron: number, fallaron: number): string {
  if (fallaron) return `${entraron} de ${entraron + fallaron} subidos. ${COLA}`
  return entraron === 1
    ? 'Subido. El OS lo lee y lo carga en Compras; el estado aparece acá abajo.'
    : `${entraron} comprobantes subidos. ${COLA}`
}

const SIN_PERMISO = 'Tu usuario no tiene permiso para cargar comprobantes. Si creés que sí debería, avisale a Dirección.'

/**
 * EL ERROR DE STORAGE O DE POSTGRES, DICHO EN CASTELLANO — y si no se reconoce, TAL CUAL.
 *
 * Una definición sola para las dos caras: la subida la hace el navegador y el renglón lo escribe la
 * acción, pero la frase la lee la misma persona en el mismo panel. Dos tablas de traducción
 * divergirían en la primera corrección.
 *
 * El default devuelve el mensaje literal a propósito: inventar «hubo un problema» sobre un error que
 * no se reconoce esconde justo el dato que hace falta para arreglarlo.
 */
export function traducirError(mensaje: string): string {
  if (/permission denied|row-level security|violates row-level|not authorized/i.test(mensaje)) return SIN_PERMISO
  if (/relation .* does not exist|schema cache/i.test(mensaje)) {
    return 'Todavía no puedo recibir comprobantes por acá: falta aplicar la migración en la base. Avisale a Dirección.'
  }
  if (/bucket not found/i.test(mensaje)) {
    return 'Todavía no está creado el depósito de comprobantes en la base. Avisale a Dirección.'
  }
  if (/duplicate key|resource already exists|already exists/i.test(mensaje)) return 'Ese archivo ya estaba en la cola.'
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(mensaje)) {
    return `Pesa más de ${Math.round(MAX_BYTES / (1024 * 1024))} MB. Sacá la foto en menor calidad y probá de nuevo.`
  }
  if (/mime type .* is not supported|invalid mime/i.test(mensaje)) {
    return 'Ese tipo de archivo no se puede leer. Se aceptan JPG, PNG, WEBP, HEIC y PDF.'
  }
  if (/jwt expired|invalid claim|token is expired/i.test(mensaje)) {
    return 'Tu sesión venció mientras subía. Volvé a entrar y probá otra vez.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) {
    return 'Se cortó la conexión mientras subía. Probá de nuevo cuando tengas señal.'
  }
  return mensaje
}

/**
 * CORRER `tarea` SOBRE `items` CON UN TOPE DE CUÁNTAS A LA VEZ, conservando el orden de entrada.
 *
 * ═══ POR QUÉ NO ES UN `Promise.all` A SECAS ═══
 *
 * Doce archivos de 5 MB saliendo juntos por la red de un celular en obra no van más rápido: se
 * pisan, y el que se queda sin ancho de banda es el que corta. De a tres, cada uno termina y libera
 * el lugar — y la persona ve avanzar la lista en vez de doce renglones quietos.
 *
 * CONTRATO: `tarea` NUNCA puede rechazar. Si rechaza, los otros obreros siguen corriendo sin que
 * nadie espere su resultado. Quien la escribe la envuelve en su propio try/catch.
 */
export async function enParalelo<T, R>(
  items: readonly T[], limite: number, tarea: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const salida = new Array<R>(items.length)
  let siguiente = 0
  const obrero = async (): Promise<void> => {
    for (let i = siguiente++; i < items.length; i = siguiente++) salida[i] = await tarea(items[i], i)
  }
  const obreros = Math.min(Math.max(1, limite), items.length)
  await Promise.all(Array.from({ length: obreros }, obrero))
  return salida
}
