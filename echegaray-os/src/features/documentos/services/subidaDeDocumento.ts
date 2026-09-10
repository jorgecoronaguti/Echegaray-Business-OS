// SUBIR UN DOCUMENTO A LA FICHA DE UNA ENTIDAD — las reglas, sin base, sin red y sin React.
//
// Pedido del dueño, 10/09/2026: *«te había pedido formas de subir documentos a las distintas
// secciones que permitan acopio de datos en la plataforma app.ecsas.com.ar y no está hecho»*.
//
// ═══ POR QUÉ NO SE INVENTÓ NADA ═══
//
// El proveedor ya podía recibir documentos desde el 09/09 (`documentosProveedor.ts` +
// `SubirDocumentoProveedor.tsx`): archivo del navegador al bucket, fila por Server Action, bucket
// privado y URL firmada de diez minutos. Lo que faltaba era ese mismo camino para la OBRA, el
// CLIENTE y la PERSONA. Acá se generaliza lo que ya funciona; `archivoAceptable` y `revisarLote`
// se IMPORTAN de allá en vez de copiarse.
//
// ═══ EL ARCHIVO NO PASA POR LA SERVER ACTION ═══
//
// El cuerpo de una Server Action corta en 1 MB y Vercel corta en 4,5 MB: el caso que hay que
// soportar —25 MB— es justamente el que no entra. El archivo va del navegador al bucket con la
// sesión del usuario (la RLS de Storage decide) y la Server Action registra el renglón validando
// tipo, tamaño y a quién pertenece la ruta. El navegador NUNCA le habla a Drive.
//
// ═══ CADA ENTIDAD GUARDA EN EL BUCKET QUE YA TIENE ═══
//
// No se crea un bucket nuevo: el PRP del puente lo prohíbe explícitamente («ningún bucket nuevo;
// los existentes se drenan»). Los tres existen y los tres son privados.

// LAS EXTENSIONES `.ts` SON OBLIGATORIAS: este módulo lo carga `node --test` directamente (Node 24
// saca los tipos solo) y ahí no existe el alias `@/` ni la resolución sin extensión de Next.
import {
  archivoAceptable, extensionDeNombre, type ArchivoElegible,
} from '../../administracion/services/documentosProveedor.ts'
import { TIPOS_ENTIDAD, type TipoEntidad } from './carpetaDeEntidad.ts'

export { TIPOS_ENTIDAD }
export type { TipoEntidad }

/**
 * PARA QUÉ SIRVE EL PAPEL, por entidad. Son las opciones del `select` y el CHECK de la tabla.
 *
 * Las listas las dictó el dueño y NO son intercambiables: un «plano» no existe en un proveedor y
 * una «libreta IERIC» no existe en una obra. Una lista única obligaría a elegir «otro» casi siempre,
 * y una categoría que casi siempre es «otro» no clasifica nada.
 */
export const CATEGORIAS_POR_TIPO = {
  obra: ['plano', 'certificado', 'acta', 'foto', 'otro'],
  cliente: ['factura', 'orden_compra', 'orden_pago', 'contrato', 'otro'],
  proveedor: ['factura', 'remito', 'presupuesto', 'otro'],
  persona: ['dni', 'alta_arca', 'libreta_ieric', 'constancia', 'otro'],
} as const satisfies Record<TipoEntidad, readonly string[]>

export type CategoriaDe<T extends TipoEntidad> = (typeof CATEGORIAS_POR_TIPO)[T][number]
export type Categoria = (typeof CATEGORIAS_POR_TIPO)[TipoEntidad][number]

/** Cómo se lee cada categoría. Un mapa y no un `replace('_',' ')`: «alta_arca» es «Alta en ARCA». */
export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  plano: 'Plano', certificado: 'Certificado', acta: 'Acta', foto: 'Foto',
  factura: 'Factura', orden_compra: 'Orden de compra', orden_pago: 'Orden de pago', contrato: 'Contrato',
  remito: 'Remito', presupuesto: 'Presupuesto',
  dni: 'DNI', alta_arca: 'Alta en ARCA', libreta_ieric: 'Libreta IERIC', constancia: 'Constancia',
  otro: 'Otro',
}

export function esCategoriaDe(tipo: TipoEntidad, v: unknown): v is Categoria {
  return typeof v === 'string' && (CATEGORIAS_POR_TIPO[tipo] as readonly string[]).includes(v)
}

/**
 * EN QUÉ BUCKET GUARDA CADA ENTIDAD. Los cuatro ya existían y los cuatro son privados.
 *
 * `documentos-legajo` tiene hoy un techo de 10 MB y una lista de mime acotada; la migración
 * `20260910T2320` los sube al techo declarado acá. Mientras no esté aplicada, un PDF de 12 MB de un
 * legajo rebota en Storage con su propio mensaje — no se rompe nada, no entra el archivo.
 */
export const BUCKET_POR_TIPO: Record<TipoEntidad, string> = {
  obra: 'obras-documentos',
  cliente: 'documentos-cliente',
  proveedor: 'proveedores-documentos',
  persona: 'documentos-legajo',
}

/**
 * EL TECHO POR ARCHIVO: 25 MB, dicho por el dueño.
 *
 * Es más bajo que el del bucket de obras (50 MB) a propósito: el techo que se anuncia tiene que ser
 * el que se cumple en las cuatro fichas, y `documentos-legajo` no llega a 50. Un techo distinto por
 * pantalla se convierte en «a veces entra y a veces no».
 */
export const MAX_BYTES = 25 * 1024 * 1024

/**
 * QUÉ TIPOS DE ARCHIVO ENTRAN.
 *
 * A diferencia del proveedor —donde el dueño pidió «lo que sea que necesite cargar» y no hay lista
 * blanca— acá el pedido nombró PDF, imagen y xlsx. La lista es blanca por eso, y `otros` de office
 * entran porque rechazar un `.docx` de un acta sería rechazar el caso real. Lo que NO entra es
 * ejecutable ni HTML: un `.html` servido desde el origen de Storage se ejecuta en ese origen.
 */
export const EXTENSIONES = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'gif',
  'xlsx', 'xls', 'xlsm', 'csv', 'doc', 'docx', 'odt', 'ods', 'txt',
] as const

export interface Aceptado { mediaType: string; extension: string }

/**
 * ¿ESTE ARCHIVO ENTRA?
 *
 * Se apoya en `archivoAceptable` (nombre, vacío, tipo) y agrega las DOS reglas propias: el techo de
 * 25 MB y la lista de extensiones. El orden importa: primero lo que ya está probado, después lo
 * nuestro, para que el mensaje que ve la persona sea siempre el más específico que se pudo dar.
 */
export function archivoEntra(f: ArchivoElegible): { ok: true; dato: Aceptado } | { ok: false; error: string } {
  const base = archivoAceptable(f)
  if (!base.ok) return { ok: false, error: base.error }
  // EL TECHO SE COMPRUEBA ACÁ Y NO SE DELEGA: `archivoAceptable` usa el del proveedor (50 MB), que
  // es el doble. Sin esta línea, un archivo de 40 MB pasaría la revisión y rebotaría recién en
  // Storage —después de viajar entero, con la persona esperando— o entraría en el bucket de obras,
  // que sí lo acepta, dejando dos techos distintos según la ficha.
  if (f.size > MAX_BYTES) {
    return { ok: false, error: `«${f.name}» pesa más de ${MAX_BYTES / (1024 * 1024)} MB. Subilo a Drive y dejá acá el enlace.` }
  }
  const extension = extensionDeNombre(f.name)
  if (!(EXTENSIONES as readonly string[]).includes(extension)) {
    return { ok: false, error: `«${f.name}» es un .${extension}, y acá entran PDF, imágenes y planillas.` }
  }
  return { ok: true, dato: { mediaType: base.mediaType, extension } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Los ids de obra son SLUGS (`messina-bsa`), no uuid: `obra_canonica.id` es text. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/

/** ¿Sirve como id de esta entidad? La obra usa slug; las otras tres, uuid. */
export const idValido = (tipo: TipoEntidad, id: string): boolean =>
  tipo === 'obra' ? SLUG.test(id) || UUID.test(id) : UUID.test(id)

/**
 * EL NOMBRE DEL OBJETO EN EL BUCKET: `<uid>/<tipo>/<entidad_id>/<uuid>.<ext>`.
 *
 * La PRIMERA carpeta es parte de la cerradura, no un orden lindo: la policy de Storage exige
 * `(storage.foldername(name))[1] = auth.uid()::text`. Si el uid llegara vacío, la ruta empezaría con
 * `/`, la primera carpeta sería la cadena vacía y Storage contestaría un «row-level security» que no
 * le dice nada a nadie. Por eso se valida acá, donde se puede explicar.
 */
export function rutaDeObjeto(p: { uid: string; tipo: TipoEntidad; entidadId: string; id: string; nombre: string }): string {
  if (!UUID.test(p.uid)) throw new Error(`La ruta necesita un usuario válido; vino «${p.uid}».`)
  if (!UUID.test(p.id)) throw new Error(`La ruta necesita un identificador de archivo válido; vino «${p.id}».`)
  if (!idValido(p.tipo, p.entidadId)) throw new Error(`«${p.entidadId}» no sirve como identificador de ${p.tipo}.`)
  return `${p.uid}/${p.tipo}/${p.entidadId}/${p.id}.${extensionDeNombre(p.nombre)}`
}

/**
 * La MISMA pregunta que hace la policy de la tabla, del lado del servidor.
 *
 * Sin esto, la acción que registra la fila sería un ariete: alguien podría mandar el `storage_path`
 * del papel de OTRA obra y la ficha lo mostraría como suyo. La policy lo rebota igual —ahí está la
 * cerradura—, pero con un mensaje ilegible y sólo mientras nadie la toque.
 */
export function esRutaDe(ruta: string, uid: string, tipo: TipoEntidad, entidadId: string): boolean {
  return typeof ruta === 'string' && ruta.startsWith(`${uid}/${tipo}/${entidadId}/`)
}

/**
 * LO QUE SE COMPRUEBA ANTES DE ESCRIBIR LA FILA, en una función pura.
 *
 * Vive acá y no adentro de la Server Action porque una Server Action no se puede probar con
 * `node --test`: para llamarla haría falta una sesión, un cliente de Supabase y la tabla. Estas tres
 * preguntas —¿la categoría es de este tipo?, ¿el id sirve?, ¿la ruta es de esta ficha?— son las que
 * impiden que la acción se use como ariete, así que tienen que poder ponerse rojas.
 *
 * La policy de la base hace las mismas preguntas. Ahí está la cerradura; acá está la frase.
 */
export function revisarAlta(
  d: { tipo: TipoEntidad; entidadId: string; categoria: string; storagePath: string },
  uid: string,
): { ok: true } | { ok: false; error: string } {
  if (!(CATEGORIAS_POR_TIPO[d.tipo] as readonly string[]).includes(d.categoria)) {
    return { ok: false, error: `«${d.categoria}» no es una categoría de ${d.tipo}.` }
  }
  if (!idValido(d.tipo, d.entidadId)) return { ok: false, error: 'La ficha de destino no es válida.' }
  if (!esRutaDe(d.storagePath, uid, d.tipo, d.entidadId)) {
    return { ok: false, error: 'Ese archivo no corresponde a esta ficha.' }
  }
  return { ok: true }
}
