// EL ARCHIVO QUE ALGUIEN SUBE EN LA PANTALLA 24 — las reglas, sin base ni red.
//
// La pantalla acepta un archivo, la base lo encola y el worker de la VM lo procesa con el mismo
// circuito que el bot de Mattermost. Lo que vive acá es lo que se decide ANTES de subir y lo que se
// muestra DESPUÉS, y las dos cosas son puras a propósito: se prueban sin navegador y sin Supabase.

/** El tono del `Estado` del design system. Se escribe acá como unión de literales —igual que en
 *  `comprasEstado.ts`— para que este módulo no importe NADA y se pueda probar con `node --test`. */
type TonoEstado = 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente'

/** Los estados de `public.comprobante_entrada`. El CHECK de la tabla es esta lista. */
export const ESTADOS = [
  'pendiente', 'procesando', 'cargado', 'ya_estaba', 'en_espera', 'rechazado', 'error',
] as const
export type EstadoEntrada = (typeof ESTADOS)[number]

export interface EntradaComprobante {
  id: string
  nombre_archivo: string
  media_type: string
  bytes: number
  estado: EstadoEntrada
  motivo: string | null
  subido_at: string
  subido_por: string
  resultado: ResultadoEntrada | null
}

/** Lo que el worker guardó del circuito. `comprobantes: null` = no se pudo leer el registro. */
export interface ResultadoEntrada {
  texto?: string | null
  cargados?: number
  yaEstaban?: number
  suma?: number
  comprobantes?: Array<{ proveedor?: string | null; numero?: string | null; total?: string | number | null; fila?: number | null }> | null
}

/**
 * QUÉ DICE CADA ESTADO, Y POR QUÉ NO SON CINCO SINÓNIMOS DE «OK».
 *
 * `cargado` y `ya_estaba` son los dos buenos y son DISTINTOS: uno agregó una fila al libro de la
 * empresa, el otro confirmó que no hacía falta. Pintarlos iguales haría que subir diez comprobantes
 * ya cargados se viera como diez gastos nuevos.
 *
 * `en_espera` NO es un error: el comprobante está vivo esperando a una persona (el freno de mano de
 * Sheets puesto, un proveedor fuera del desplegable, un dato que no se lee). Pintarlo rojo mandaría
 * a volver a subir el mismo archivo, que es lo único que seguro no ayuda.
 */
export const ROTULO: Record<EstadoEntrada, { texto: string; tono: TonoEstado; ayuda: string }> = {
  pendiente: { texto: 'En cola', tono: 'pendiente', ayuda: 'Subido. El OS lo va a leer en menos de un minuto.' },
  procesando: { texto: 'Leyendo', tono: 'curso', ayuda: 'El OS lo está leyendo y cruzando contra ARCA, el banco y la pestaña Compras.' },
  cargado: { texto: 'Cargado', tono: 'pos', ayuda: 'Entró como fila nueva en la pestaña Compras del Flujo de Fondos.' },
  ya_estaba: { texto: 'Ya estaba', tono: 'pos', ayuda: 'Ese comprobante ya estaba cargado. No se duplicó.' },
  en_espera: { texto: 'Falta algo', tono: 'warn', ayuda: 'Se leyó pero todavía no entró: hace falta que una persona resuelva algo.' },
  rechazado: { texto: 'No se pudo leer', tono: 'neg', ayuda: 'No se cargó nada. Sacá la foto de nuevo con el total y el número enteros, sin reflejos.' },
  error: { texto: 'Falló', tono: 'neg', ayuda: 'Falló por un problema del sistema. Se reintenta solo; si sigue, avisale a Dirección.' },
}

/** Los estados en los que la pantalla todavía tiene que refrescar. */
export const EN_CURSO: readonly EstadoEntrada[] = ['pendiente', 'procesando']

export function hayTrabajoEnCurso(filas: readonly { estado: EstadoEntrada }[]): boolean {
  return filas.some((f) => EN_CURSO.includes(f.estado))
}

/** Los tipos que el circuito sabe mirar. Es la MISMA lista que el bucket y que `MEDIA_ACEPTADOS`. */
export const MEDIA_ACEPTADOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'image/heic', 'image/heif',
] as const

/** El techo del adjunto del circuito (`MAX_BYTES_ADJUNTO`). Arriba de esto la API de visión rechaza. */
export const MAX_BYTES = 5 * 1024 * 1024

/** Cuántos archivos entran de una vez. Es `MAX_ADJUNTOS` del circuito: un álbum no es un fajo. */
export const MAX_ARCHIVOS = 12

const POR_EXTENSION: Record<string, string> = {
  heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
}

/**
 * ¿Este archivo se puede subir, y con qué tipo?
 *
 * ═══ EL TIPO NO SALE SOLO DEL `type` DEL NAVEGADOR ═══
 *
 * Para un `.HEIC` —el formato POR DEFECTO de la cámara del iPhone— Safari y varios Android mandan
 * `type` vacío o `application/octet-stream`. Con el tipo a secas, el archivo más común del dueño se
 * rechazaría en la puerta. La extensión del nombre es la otra evidencia y es la que la persona ve
 * escrita. Es la misma regla que el bot ya aplica sobre lo que declara Mattermost.
 */
export function archivoAceptable(
  f: { name: string; type?: string; size: number },
): { ok: true; mediaType: string } | { ok: false; error: string } {
  const declarado = String(f.type ?? '').split(';')[0].trim().toLowerCase()
  const ext = String(f.name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const mediaType = (MEDIA_ACEPTADOS as readonly string[]).includes(declarado)
    ? declarado
    : (ext ? POR_EXTENSION[ext] : undefined)
  if (!mediaType) {
    return { ok: false, error: `«${f.name}» no es una foto ni un PDF. Se aceptan JPG, PNG, WEBP, HEIC y PDF.` }
  }
  if (!(f.size > 0)) return { ok: false, error: `«${f.name}» está vacío.` }
  if (f.size > MAX_BYTES) {
    return { ok: false, error: `«${f.name}» pesa más de 5 MB. Sacá la foto en menor calidad y probá de nuevo.` }
  }
  return { ok: true, mediaType }
}

/** La extensión que le corresponde a un tipo, para el nombre en Storage. */
export function extensionDe(mediaType: string): string {
  return Object.entries(POR_EXTENSION).find(([, v]) => v === mediaType)?.[0] ?? 'bin'
}
