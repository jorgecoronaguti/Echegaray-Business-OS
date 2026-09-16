// EL ARCHIVO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FILA A LA TABLA.
//
// Las reglas puras están en `comprobanteDePago.ts` y se prueban con `node --test`. Acá vive lo que
// toca la red. Este módulo SÓLO se importa desde un componente cliente — es el mismo reparto que
// `subidaAlBucket.ts`, y por el mismo motivo.

import { createClient } from '@/lib/supabase/client'
import { comprobanteEntra, rutaDeComprobante } from './comprobanteDePago'
import { registrarComprobanteDePago } from './comprobanteDePagoActions'

export type SubidaDeComprobante = { ok: true; id: string } | { ok: false; error: string }

/**
 * Sube UN comprobante de pago y lo registra contra la fila.
 *
 * `upsert: false` porque el nombre es un uuid nuevo: un choque sería una señal, no un reemplazo.
 * `contentType` explícito porque un `.heic` llega con `type` vacío en varios navegadores y sin esto
 * Storage lo guardaría como `text/plain`, que además el bucket no acepta.
 */
export async function subirComprobanteDePago(
  archivo: File, { fila, cambioId }: { fila: number; cambioId?: string | null },
): Promise<SubidaDeComprobante> {
  const control = comprobanteEntra(archivo)
  if (!control.ok) return { ok: false, error: control.error }

  let ruta: string
  try {
    ruta = rutaDeComprobante({ fila, id: crypto.randomUUID(), extension: control.dato.extension })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from('comprobantes').upload(ruta, archivo, { contentType: control.dato.mediaType, upsert: false })
  if (error) {
    // Un «row-level security» acá casi siempre es la policy del prefijo (migración 20260916T1800 sin
    // aplicar). Decir «no pude subirlo» mandaría a buscar el problema al lado equivocado.
    return {
      ok: false,
      error: /row-level security|violates/i.test(error.message)
        ? 'Storage no deja subir a la carpeta de pagos (migración 20260916T1800 sin aplicar).'
        : `No pude subir «${archivo.name}».`,
    }
  }

  const alta = await registrarComprobanteDePago({
    fila, cambioId: cambioId ?? null, storagePath: ruta, nombre: archivo.name,
    mediaType: control.dato.mediaType as never, bytes: archivo.size,
  })
  // SIN FILA NO HAY COMPROBANTE: el archivo está en el bucket pero nadie lo va a encontrar. Decir
  // «subido» sería archivar un papel donde nadie lo va a buscar.
  return alta.ok ? { ok: true, id: alta.dato } : { ok: false, error: alta.error }
}
