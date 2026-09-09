'use server'

// LA ÚNICA ESCRITURA DEL COSTO REAL: cargar una versión de una alícuota.
//
// ═══ CAMBIAR UNA ALÍCUOTA ES AGREGAR UNA FILA, NO EDITAR LA QUE HABÍA ═══
//
// Un `update` sobre la fila vigente reescribiría en silencio el costo de una obra ya cerrada:
// marzo se recalcularía con la ART de septiembre. Por eso esto sólo hace `insert` — y la base lo
// impone además con `revoke update, delete` sobre `authenticated`, así que ni una llamada directa
// a PostgREST puede corregir una alícuota vieja.
//
// ═══ LA PANTALLA ES LA PUERTA; LA POLICY ES LA CERRADURA ═══
//
// Una server action es un endpoint: se invoca con el id que viaja en el HTML sin abrir jamás la
// pantalla. Por eso el rol se vuelve a preguntar acá con `permisoDeLiquidacion` —la misma decisión
// pura que usa `liquidacionActions`— y la cerradura final es `public.liquida_sueldos()` en la RLS.
// Jefe de obra NO entra, aunque `es_administracion()` lo incluya para el resto del legajo.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'

const RUTA = '/administracion/personas'

const alicuotaSchema = z.object({
  concepto: z.enum([
    'cargas_sociales', 'art', 'fondo_cese', 'seguro_vida_sepelio', 'no_trabajado_pago',
  ]),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de vigencia es obligatoria'),
  // EL MISMO RANGO QUE EL CHECK DE LA BASE. Una alícuota de 300 % es un typo que multiplica los
  // sueldos de diecisiete personas: se frena antes del viaje, y la base lo vuelve a frenar.
  porcentaje: z.coerce.number().min(0, 'No existe una alícuota negativa').max(100, 'Más de 100 % es un typo'),
  base: z.enum(['declarado', 'total']),
  // NINGÚN NÚMERO SIN ORIGEN. La base lo exige con un CHECK; acá se dice con palabras.
  fuente: z.string().trim().min(1, 'Falta de dónde salió el porcentaje'),
})

export type ResultadoCosto = { ok: true; mensaje: string } | { ok: false; error: string }

export async function guardarAlicuota(entrada: unknown): Promise<ResultadoCosto> {
  const parsed = alicuotaSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos. No guardé nada.' }
  }
  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ. Un insert que la policy rechaza sin
  // error no puede acusar una alícuota que no se guardó — el 204 no prueba la escritura.
  const r = await supabase
    .from('costo_hora_alicuota')
    .insert({ ...parsed.data, autor: perfil?.id ?? null })
    .select('id, concepto, desde')
    .maybeSingle()

  if (r.error) {
    // El UNIQUE `(concepto, desde)` es el que evita dos verdades para el mismo día.
    if (r.error.code === '23505') {
      return { ok: false, error: 'Ya hay una versión de ese concepto con esa fecha. Cambiá la fecha o corregí la que existe cargando una posterior.' }
    }
    return { ok: false, error: `No pude guardar: ${r.error.message}` }
  }
  if (!r.data) return { ok: false, error: 'No pude guardar: la base no devolvió la fila.' }

  revalidatePath(RUTA)
  return { ok: true, mensaje: `Versión guardada: rige desde el ${parsed.data.desde}. La anterior queda para las obras ya cargadas.` }
}
