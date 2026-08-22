'use server'

// CERRAR Y REABRIR UN PERÍODO DE HH — las dos acciones que escriben.
//
// ═══ LA VALIDACIÓN NO ESTÁ ACÁ, Y NO ES UN OLVIDO ═══
//
// Ni el permiso económico ni «no quedan correcciones pendientes» se comprueban en TypeScript: los
// comprueba `cerrar_periodo_hh()` adentro de la transacción que sella. Repetirlos acá daría una
// segunda definición que se desincroniza —y que además no protege una llamada directa a PostgREST,
// que es la única puerta que importa cerrar. Lo que sí hace esta capa es traducir el error de la
// base a una frase que se pueda leer, y RELEER EL EFECTO.
//
// ═══ EL EFECTO SE RELEE ═══
//
// Un `rpc` que no tira error no prueba que el período quedó cerrado. Lo que lo prueba es la fila
// leída después, en su destino. Si la relectura no dice `cerrado`, la acción devuelve error aunque
// la base haya contestado que sí.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './personasActions'

const RUTA = '/administracion/personas/cuadrillas/periodos'

// El período viaja como argumento y no en un FormData: cerrar no tiene campos que llenar, es un
// botón contra una fila — el mismo patrón de `archivarCuadrilla`. Se valida igual: lo que llega del
// navegador nunca se cree, aunque haya salido de un `bind` del servidor.
const periodoSchema = z.string().regex(/^\d{4}-\d{2}-01$/, 'El período es el primer día del mes')

/** Postgres devuelve el mensaje del `raise exception`; PostgREST lo envuelve. El caso que la
 *  pantalla tiene que poder explicar sin jerga es el del permiso. */
function explicar(mensaje: string): string {
  if (/42501|económico|Dirección o Administración/i.test(mensaje)) {
    return 'Cerrar o reabrir un período de HH tiene efecto económico: sólo Dirección o Administración.'
  }
  return mensaje
}

export async function cerrarPeriodo(periodoCrudo: string): Promise<Resultado> {
  const parsed = periodoSchema.safeParse(periodoCrudo)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const periodo = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('cerrar_periodo_hh', { p_periodo: periodo })
  if (error) return { ok: false, error: explicar(error.message) }

  const { data } = await supabase
    .from('periodo_hh_panel').select('estado').eq('periodo', periodo).maybeSingle()
  if ((data as { estado?: string } | null)?.estado !== 'cerrado') {
    return {
      ok: false,
      error: 'La base contestó que sí, pero el período sigue sin figurar cerrado. No lo doy por hecho.',
    }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

export async function reabrirPeriodo(periodoCrudo: string): Promise<Resultado> {
  const parsed = periodoSchema.safeParse(periodoCrudo)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const periodo = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('reabrir_periodo_hh', { p_periodo: periodo })
  if (error) return { ok: false, error: explicar(error.message) }

  const { data } = await supabase
    .from('periodo_hh_panel').select('estado').eq('periodo', periodo).maybeSingle()
  if ((data as { estado?: string } | null)?.estado !== 'abierto') {
    return {
      ok: false,
      error: 'La base contestó que sí, pero el período sigue figurando cerrado. No lo doy por hecho.',
    }
  }

  revalidatePath(RUTA)
  return { ok: true }
}
