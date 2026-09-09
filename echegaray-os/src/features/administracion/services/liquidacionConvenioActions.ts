'use server'

// LA ÚNICA ESCRITURA DE LA EXPOSICIÓN AL CONVENIO: cargar un piso de escala.
//
// ═══ POR QUÉ ES UNA ESCRITURA Y NO UNA SEMILLA DE MIGRACIÓN ═══
//
// `convenio_escala` nace VACÍA a propósito (migración 20260909T1720): sembrarla con números
// inventados convertiría «sin cargar» en un piso falso, y el «bajo el piso» de la pantalla pasaría a
// acusar gente por una escala que nadie firmó. El piso entra por acá, con la persona que lo cargó y
// la FUENTE de la que salió — un acuerdo, una escala publicada, la réplica del CCT que el OS ya
// tiene—. Ningún número sin origen.
//
// ═══ CARGAR UN PISO ES AGREGAR UNA FILA, NUNCA CORREGIR LA VIEJA ═══
//
// Un piso vencido no se edita: se agrega el nuevo con otro `desde`, igual que `persona_tarifa`.
// Reescribir el de julio con el valor de agosto declararía en infracción una quincena que se pagó
// bien. La base lo hace cumplir: `authenticated` tiene REVOCADOS update y delete sobre la tabla, así
// que esto no es una convención de este archivo — es una cerradura.
//
// ═══ LA PANTALLA ES LA PUERTA; LA POLICY ES LA CERRADURA ═══
//
// La solapa sólo se dibuja para quien liquida, pero una server action es un endpoint y se invoca sin
// abrir jamás la pantalla. Por eso el rol se vuelve a preguntar acá con `liquidaSueldos()`, igual
// que en `liquidacionActions`. La cerradura final la decide `public.liquida_sueldos()` en la RLS.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'

const RUTA = '/administracion/personas'

/**
 * EL FORMULARIO MÍNIMO: convenio, categoría, valor hora, desde y fuente.
 *
 * `valor_hora` es `positive()` y no `nonnegative()` porque un piso de $ 0 no existe: pondría a todo
 * el plantel «sobre el piso» y apagaría el control entero con una fila. El CHECK de la base dice lo
 * mismo (`convenio_escala_positiva`); acá se dice antes para poder devolver un mensaje legible.
 */
const escalaSchema = z.object({
  convenio: z.string().trim().min(1, 'Elegí el convenio.').max(120),
  categoria: z.string().trim().min(1, 'Elegí la categoría.').max(80),
  valor_hora: z.coerce.number().positive('El piso tiene que ser mayor que cero.').finite(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de vigencia va en formato AAAA-MM-DD.'),
  // SIN FUENTE NO ENTRA. Un piso sin origen es un número que nadie puede volver a verificar, y con
  // él se decide si la empresa le debe plata a alguien. El CHECK de la base exige lo mismo.
  fuente: z.string().trim().min(3, 'Decí de dónde salió el número: sin fuente no se carga.').max(300),
})

export type ResultadoEscala = { ok: true; mensaje: string } | { ok: false; error: string }

/** Guarda un piso de escala. Devuelve el efecto leído de la base, nunca «guardado» a ciegas. */
export async function cargarEscalaDeConvenio(entrada: unknown): Promise<ResultadoEscala> {
  const parsed = escalaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const { data, error } = await supabase.from('convenio_escala')
    .insert(parsed.data)
    .select('convenio, categoria, desde, valor_hora')

  if (error) {
    // 23505 = ya hay un piso para ese convenio, esa categoría y esa fecha. No se pisa: se cambia la
    // fecha de vigencia, que es la que distingue un acuerdo del siguiente.
    if (error.code === '23505') {
      return {
        ok: false,
        error: `Ya hay un piso cargado para ${parsed.data.categoria} de ${parsed.data.convenio} desde ${parsed.data.desde}. Un acuerdo nuevo va con otra fecha de vigencia.`,
      }
    }
    return { ok: false, error: error.message }
  }
  // UN 204 NO PRUEBA UNA ESCRITURA. Cero filas devueltas es la policy rechazando en silencio, y
  // decir «guardado» ahí es el verde falso que este repo ya pagó.
  if ((data ?? []).length === 0) {
    return { ok: false, error: 'La base no guardó el piso (permiso). No cambió nada.' }
  }

  revalidatePath(RUTA)
  const f = data![0] as { categoria: string; valor_hora: number | string; desde: string }
  return {
    ok: true,
    mensaje: `Piso cargado: ${f.categoria} $${Number(f.valor_hora).toLocaleString('es-AR')}/h desde ${f.desde}.`,
  }
}
