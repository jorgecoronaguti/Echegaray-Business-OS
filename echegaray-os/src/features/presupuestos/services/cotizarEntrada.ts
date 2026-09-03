// LA ENTRADA DE `POST/GET /api/presupuestos/cotizar` — la parte de la ruta que se puede probar con
// `node --test` sin mockear `NextRequest`/cookies/Supabase.
//
// Por qué vive acá y no en la ruta: el runner de `.test.ts` no resuelve el alias `@/…` (ver
// `shared/xsas/url.ts` — misma razón, mismo patrón). Un módulo puro en su propio archivo, sin
// importar el cliente de Supabase ni Next, se prueba; metido en `route.ts` no.
//
// Las dos rutas (`route.ts` y `[id]/route.ts`) importan de acá el schema de entrada, el cálculo del
// hash y el mapeo de errores — no lo reimplementan.

import { createHash } from 'node:crypto'
import { z } from 'zod'

// ── EL SCHEMA DE ENTRADA DEL POST ───────────────────────────────────────────────────────────────
//
// Mismos topes que `api/xsas/route.ts`: hasta 10 adjuntos, hasta ~8 MB de archivo cada uno (~10,9 MB
// en base64 — la codificación agrega ~1/3). El RPC (`cotizacion_encolar_lectura`) los vuelve a
// imponer del lado de la base — este schema sólo da un error legible ANTES de esa llamada.

export const TOPE_ADJUNTOS = 10
export const TOPE_BASE64 = 11 * 1024 * 1024

export const AdjuntoEntradaSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  contenido_base64: z.string().min(1).max(TOPE_BASE64),
})

export const EntradaCotizarSchema = z.object({
  mensaje: z.string().trim().max(2000).optional(),
  adjuntos: z.array(AdjuntoEntradaSchema).min(1, 'necesito al menos un plano adjunto').max(TOPE_ADJUNTOS),
})

export type AdjuntoEntrada = z.infer<typeof AdjuntoEntradaSchema>
export type EntradaCotizar = z.infer<typeof EntradaCotizarSchema>

/** El `id` de la lectura que viaja en la URL del GET. */
export const IdLecturaSchema = z.string().uuid()

// ── EL HASH — LA IDENTIDAD REAL DE UN ADJUNTO ───────────────────────────────────────────────────
//
// Se calcula ACÁ, del lado del servidor, con el mismo criterio que `hashDe()` en
// `orquestador/lib/xsas-archivos.mjs`: sha256 del BINARIO decodificado, no del texto base64. El RPC
// valida que tenga forma de sha256 (64 hex) pero no lo recalcula — no tiene `pgcrypto` garantizado
// en su `search_path` (ver la migración).

export function hashDeAdjunto(contenidoBase64: string): string {
  return createHash('sha256').update(Buffer.from(contenidoBase64, 'base64')).digest('hex')
}

export type AdjuntoConHash = { nombre: string; hash: string; contenido_base64: string }

/** Los adjuntos ya validados por el schema, con su hash calculado — el shape exacto que recibe
 *  `p_adjuntos` del RPC. */
export function adjuntosConHash(adjuntos: AdjuntoEntrada[]): AdjuntoConHash[] {
  return adjuntos.map((a) => ({ nombre: a.nombre, hash: hashDeAdjunto(a.contenido_base64), contenido_base64: a.contenido_base64 }))
}

// ── EL MAPEO DE ERRORES: RPC/POSTGRES → HTTP ────────────────────────────────────────────────────
//
// El RPC valida con `raise exception 'texto'` sin SQLSTATE explícito: PL/pgSQL le pone el código
// por default P0001 (documentado — ERRCODE_RAISE_EXCEPTION), y PostgREST lo reenvía tal cual en
// `error.code`. Eso es SIEMPRE responsabilidad del que llamó — 400, con el texto que ya viene
// legible en castellano. Cualquier otro código es la base o la red fallando, no el cliente:
//   · sin código, o de la clase `08` (connection_exception) → 502, "aguas abajo no contesta"
//   · cualquier otro (columna que no existe, tipo que no castea, permiso denegado inesperado) → 500
// Éste es exactamente el defecto que la migración de `cotizacion_encolar_lectura` nunca había
// podido descartar en runtime — ver `orquestador/lib/cotizacion-encolar-lectura.pg.test.mjs`.

export interface ErrorPostgres { message?: string | null; code?: string | null }
export type StatusHttpError = 400 | 500 | 502
export interface ErrorClasificado { status: StatusHttpError; motivo: string }

const RAISE_EXCEPTION = 'P0001'

export function clasificarErrorRpc(error: ErrorPostgres): ErrorClasificado {
  const motivo = error.message?.trim() || 'error desconocido del servidor'
  if (error.code === RAISE_EXCEPTION) return { status: 400, motivo }
  if (!error.code || error.code.startsWith('08')) return { status: 502, motivo: 'no se pudo alcanzar la base — reintentá' }
  return { status: 500, motivo: 'error inesperado del servidor' }
}
