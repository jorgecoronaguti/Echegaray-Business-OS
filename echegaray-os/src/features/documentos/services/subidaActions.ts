'use server'

// REGISTRAR EL DOCUMENTO QUE YA ESTÁ EN EL BUCKET, Y DEJARLO ENCOLADO PARA DRIVE.
//
// El archivo NO viaja por acá: lo subió el navegador con la sesión del usuario (25 MB no entran en
// una Server Action — 1 MB de techo en Next, 4,5 MB en Vercel). Lo que llega es el renglón.
//
// LA CERRADURA ES POSTGRES, NO ESTE ARCHIVO. La policy de `entidad_documento` exige `subido_por =
// auth.uid()`, la ruta con el prefijo del uid, `es_administracion()` y —para una obra— `ve_obra()`.
// Lo que se hace acá es la MISMA pregunta antes de escribir, para poder contestarla en castellano en
// vez de con un «new row violates row-level security policy» que no le dice nada a nadie.
//
// LA COLA A DRIVE NO SE «LANZA»: la fila nace `drive_estado='pendiente'` y eso ES la cola. Encolar
// desde acá con un fetch al worker ataría la respuesta de la pantalla a que la VM esté viva.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { traducirError } from '@/features/administracion/services/documentosProveedor'
import {
  BUCKET_POR_TIPO, CATEGORIAS_POR_TIPO, MAX_BYTES, TIPOS_ENTIDAD, revisarAlta, type TipoEntidad,
} from './subidaDeDocumento'
import { diasCubiertos } from './certificadoDeLicencia'

export type Resultado =
  /** `cubre`: sólo en un certificado médico — cuántos días de licencia declarada respalda. */
  | { ok: true; id: string; cubre: number | null }
  | { ok: false; error: string }

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()

/** Todas las categorías de las cuatro entidades. El corte por tipo lo hace `esCategoriaDe`. */
const TODAS = [...new Set(Object.values(CATEGORIAS_POR_TIPO).flat())] as [string, ...string[]]

const Alta = z.object({
  tipo: z.enum(TIPOS_ENTIDAD),
  entidadId: z.string().trim().min(1).max(64),
  storagePath: z.string().trim().min(3).max(400),
  nombreArchivo: z.string().trim().min(1).max(255),
  tipoMime: z.string().trim().min(3).max(255),
  tamanoBytes: z.number().int().positive().max(MAX_BYTES),
  categoria: z.enum(TODAS),
  descripcion: z.string().trim().max(400).nullable().optional(),
  fechaDocumento: FECHA,
  licenciaDesde: FECHA,
  licenciaHasta: FECHA,
})
export type AltaDeDocumento = z.infer<typeof Alta>

export async function registrarDocumentoDeEntidad(entrada: AltaDeDocumento): Promise<Resultado> {
  const v = Alta.safeParse(entrada)
  if (!v.success) return { ok: false, error: 'Los datos del documento no son válidos.' }
  const d = v.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar y probá otra vez.' }

  // LAS TRES PREGUNTAS QUE IMPIDEN USAR ESTA ACCIÓN COMO ARIETE —categoría cruzada con el tipo, id
  // de la ficha, y que la ruta sea de ESTA ficha y de ESTE usuario— viven en una función pura para
  // poder ponerse rojas en un test. La policy pregunta lo mismo: ahí está la cerradura.
  const control = revisarAlta(d, user.id)
  if (!control.ok) return control

  const { data, error } = await supabase
    .from('entidad_documento')
    .insert({
      entidad_tipo: d.tipo,
      entidad_id: d.entidadId,
      bucket: BUCKET_POR_TIPO[d.tipo],
      storage_path: d.storagePath,
      nombre_archivo: d.nombreArchivo,
      tipo_mime: d.tipoMime,
      tamano_bytes: d.tamanoBytes,
      categoria: d.categoria,
      descripcion: d.descripcion?.trim() || null,
      subido_por: user.id,
      fecha_documento: d.fechaDocumento || null,
      licencia_desde: control.licencia?.desde ?? null,
      licencia_hasta: control.licencia?.hasta ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: traducirError(error.message) }

  // La ficha tiene que mostrarlo sin que nadie recargue a mano.
  revalidatePath(RUTA[d.tipo](d.entidadId))
  return { ok: true, id: String(data.id), cubre: control.licencia ? await cobertura(d.entidadId, control.licencia) : null }
}

/**
 * CUÁNTOS DÍAS DE LICENCIA DECLARADA RESPALDA EL CERTIFICADO QUE ACABA DE ENTRAR. Se lee
 * `asistencia_dia` —lo que el jefe declaró—, nunca se escribe: el certificado no crea la licencia.
 * Una lectura que falla devuelve `null`, que la pantalla muestra como «no pude cruzarlo», no como 0.
 */
async function cobertura(personaId: string, l: { desde: string; hasta: string }): Promise<number | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('asistencia_dia').select('fecha, estado, motivo')
    .eq('persona_id', personaId).gte('fecha', l.desde).lte('fecha', l.hasta)
  if (error) return null
  return diasCubiertos((data ?? []) as { fecha: string; estado: string; motivo: string | null }[], l.desde, l.hasta).length
}

/** Qué pantalla vuelve a dibujarse. Un mapa y no un template: cada ficha tiene su forma de URL. */
const RUTA: Record<TipoEntidad, (id: string) => string> = {
  obra: (id) => `/obras/${id}`,
  cliente: () => '/clientes',
  proveedor: (id) => `/administracion/proveedores/${id}`,
  persona: (id) => `/administracion/personas/${id}`,
}
