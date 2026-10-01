// LA FOTO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA RUTA A LA SERVER ACTION — sólo se importa
// desde un componente cliente.
//
// Las reglas puras (qué entra, cómo se llama el objeto, qué se le dice a la persona) están en
// `logica/foto.ts` y se prueban con `node --test`. Acá vive lo que toca la red: el `upload()` con la
// sesión del usuario. El cliente de Supabase se baja recién al elegir la foto (`await import`), como
// en Compras: la ficha se abre cien veces por cada foto que se saca.

import { controlarFoto, rutaDeFoto, traducirErrorDeFoto, BUCKET_FOTOS } from '../logica/foto'

export type FotoSubida = { ok: true; ruta: string } | { ok: false; error: string }

/**
 * Sube la foto y devuelve la RUTA dentro del bucket (no la URL): la Server Action la valida por forma
 * (`esRutaDeFoto`) y arma la URL pública ella. `carpeta` es el id del activo, `incidencias/<id>` o `alta`.
 */
export async function subirFotoDeActivo(archivo: File, carpeta: string): Promise<FotoSubida> {
  const control = controlarFoto(archivo)
  if (!control.ok) return control
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar y probá otra vez.' }
    const ruta = rutaDeFoto({ carpeta, id: crypto.randomUUID(), extension: control.extension })
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(ruta, archivo, { contentType: control.mediaType, upsert: false })
    if (error) return { ok: false, error: traducirErrorDeFoto(error.message) }
    return { ok: true, ruta }
  } catch (e) {
    return { ok: false, error: traducirErrorDeFoto(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * Varias fotos a la misma carpeta, de a una (por 4G, en paralelo se cortan todas a la vez). Se corta en
 * la primera que falla: un reporte no se manda con parte de sus fotos sin que la persona lo sepa.
 */
export async function subirFotosDeActivo(archivos: readonly File[], carpeta: string): Promise<{ ok: true; rutas: string[] } | { ok: false; error: string }> {
  const rutas: string[] = []
  for (const archivo of archivos) {
    const s = await subirFotoDeActivo(archivo, carpeta)
    if (!s.ok) return { ok: false, error: archivos.length > 1 ? `Foto ${rutas.length + 1} de ${archivos.length}: ${s.error}` : s.error }
    rutas.push(s.ruta)
  }
  return { ok: true, rutas }
}
