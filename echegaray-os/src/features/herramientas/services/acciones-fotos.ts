'use server'

// AGREGAR FOTOS A UN ACTIVO (migración 20261001T1800) — varias de una vez, ninguna pisa a otra.
//
// Las fotos ya subieron del navegador al bucket (`services/subida-foto.ts`): acá llegan SÓLO las rutas,
// porque el cuerpo de una Server Action tiene 1 MB de techo y una foto de celular pesa más. Se valida la
// forma de cada ruta y se arma su URL pública; la portada, el autor y el «no se borra» los pone la base
// (`agregar_fotos_activo`). Mismos permisos para todos los niveles (dueño, 21/09).

import { z } from 'zod'
import { esRutaDeFoto, urlPublicaDeFoto } from '../logica/foto'
import { MIGRACION_FOTOS, TOPE_FOTOS_POR_VEZ } from '../logica/fotos'
import { rpcHerramientas, type Resultado } from './rpc'

const agregarSchema = z.object({
  activo: z.string().uuid('Falta el activo'),
  rutas: z.array(z.string().max(200).refine(esRutaDeFoto, 'La foto no quedó bien subida. Probá de nuevo.'))
    .min(1, 'No llegó ninguna foto')
    .max(TOPE_FOTOS_POR_VEZ, `Son más de ${TOPE_FOTOS_POR_VEZ} fotos: guardalas en dos tandas.`),
  /** Las fotos de más de un reporte van con él (la primera ya la guardó `reportar_problema_activo`). */
  incidencia: z.string().uuid().optional(),
})

/** Devuelve cuántas fotos nuevas quedaron guardadas. */
export async function agregarFotosAction(entrada: z.input<typeof agregarSchema>): Promise<Resultado<number>> {
  const p = agregarSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return { ok: false, error: 'Falta la URL de Supabase en el servidor.' }
  return rpcHerramientas<number>('agregar_fotos_activo', {
    p_activo: p.data.activo,
    p_urls: p.data.rutas.map((r) => urlPublicaDeFoto(base, r)),
    p_incidencia: p.data.incidencia ?? null,
  }, MIGRACION_FOTOS)
}
