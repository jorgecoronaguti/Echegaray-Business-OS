// EL ARCHIVO QUE PRUEBA QUE LA PLATA SALIÓ — las reglas puras de nombre, ruta y tipo.
//
// Vive separado de la subida por el mismo motivo que `subidaDeDocumento.ts`: esto se prueba con
// `node --test`, sin navegador y sin Storage, y es lo que decide si un archivo entra ANTES de que
// viaje entero por la red. La policy del bucket (`20260916T1800`) y la RPC repiten el techo y la
// lista: no es redundancia, es que la revisión que primero le habla a la persona es ésta, y las
// otras dos tienen que seguir diciendo que no aunque alguien llame la acción a mano.
//
// ═══ POR QUÉ LA CARPETA ES LA FILA Y NO EL USUARIO ═══
//
// La factura que carga la pantalla vive en `<auth.uid()>/…` porque su alcance es quien la subió. Un
// comprobante de pago es de la COMPRA: lo mira cualquiera de Administración desde Compras o desde la
// ficha del proveedor, y la fila es lo único que los dos caminos comparten. La policy de Storage
// acepta las dos formas y exige que la segunda carpeta sea un número, así que `pagos/` no es una
// carpeta libre donde cualquiera escribe.

/** 25 MB: lo que pidió el dueño el 16/09/2026. El bucket lo repite y la RPC también. */
export const MAX_BYTES_PAGO = 25 * 1024 * 1024

/**
 * LO QUE ENTRA, Y POR QUÉ ESTOS CUATRO.
 *
 * PDF y JPG/PNG son el 99% de lo que manda un banco o un proveedor; HEIC entra porque es lo que sale
 * de un iPhone sin convertir y rechazarlo sería rechazar la foto del recibo sacada en el momento. No
 * entra nada más: un `.html` servido desde el origen de Storage se ejecuta en ese origen.
 */
export const TIPOS_PAGO = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const
export const EXTENSIONES_PAGO = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'] as const

/** El `accept` del input, derivado de la lista: dos listas se separan, una no puede. */
export const ACCEPT_PAGO = TIPOS_PAGO.join(',')

export interface ArchivoDePago { name: string; size: number; type?: string }
export type Revision<T> = { ok: true; dato: T } | { ok: false; error: string }

const extensionDe = (nombre: string): string => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(nombre ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

/**
 * EL MEDIA TYPE QUE SE DECLARA AL SUBIR.
 *
 * No se confía en `file.type`: un `.heic` llega con `type` VACÍO en varios navegadores y Storage lo
 * guardaría como `text/plain`, que además no está en la lista blanca del bucket — el archivo entraría
 * y después no se podría abrir. Cuando el navegador no dice nada, lo decide la extensión.
 */
export function mediaTypeDe(f: ArchivoDePago): string {
  const declarado = String(f?.type ?? '').trim().toLowerCase()
  if ((TIPOS_PAGO as readonly string[]).includes(declarado)) return declarado
  const e = extensionDe(f?.name ?? '')
  if (e === 'pdf') return 'application/pdf'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  if (e === 'heic') return 'image/heic'
  if (e === 'heif') return 'image/heif'
  return declarado
}

/** ¿Este archivo entra? El mensaje nombra el archivo: en un lote de tres importa cuál falló. */
export function comprobanteEntra(f: ArchivoDePago): Revision<{ mediaType: string; extension: string }> {
  const nombre = String(f?.name ?? '').trim()
  if (!nombre) return { ok: false, error: 'El archivo no tiene nombre.' }
  if (!(f?.size > 0)) return { ok: false, error: `«${nombre}» está vacío.` }
  if (f.size > MAX_BYTES_PAGO) {
    return { ok: false, error: `«${nombre}» pesa más de ${MAX_BYTES_PAGO / (1024 * 1024)} MB.` }
  }
  const extension = extensionDe(nombre)
  if (!(EXTENSIONES_PAGO as readonly string[]).includes(extension)) {
    return { ok: false, error: `«${nombre}» es un .${extension || 'archivo sin extensión'}, y acá entran PDF, JPG, PNG o HEIC.` }
  }
  const mediaType = mediaTypeDe(f)
  if (!(TIPOS_PAGO as readonly string[]).includes(mediaType)) {
    return { ok: false, error: `«${nombre}» no es un PDF ni una imagen que se pueda guardar.` }
  }
  return { ok: true, dato: { mediaType, extension } }
}

/**
 * `pagos/<fila>/<uuid>.<ext>` — EXACTAMENTE lo que la policy de Storage y la RPC vuelven a exigir.
 *
 * La fila tiene que ser un entero de datos (empiezan en la 4) y el id un uuid: si alguno llegara
 * vacío la ruta tendría una carpeta vacía y Storage contestaría un «row-level security» que no dice
 * nada de la causa real. Tira, no devuelve una ruta inválida.
 */
export function rutaDeComprobante({ fila, id, extension }: { fila: number; id: string; extension: string }): string {
  if (!Number.isInteger(fila) || fila < 4) throw new Error('La fila de Compras no es un renglón de datos.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
    throw new Error('El identificador del archivo no es un uuid.')
  }
  if (!(EXTENSIONES_PAGO as readonly string[]).includes(String(extension).toLowerCase())) {
    throw new Error('Esa extensión no entra.')
  }
  return `pagos/${fila}/${id}.${String(extension).toLowerCase()}`
}
